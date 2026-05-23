#!/usr/bin/env node
/**
 * build.js — Turn extracted slide_data.json into an editable .pptx file.
 *
 * Usage: node build.js <slide-data.json> [--out output.pptx]
 *         [--use-background-images]   # embed full-slide screenshots as background
 *                                     # (preserves gradients/custom backgrounds);
 *                                     # foreground layers stay editable on top.
 *
 * The builder prioritizes EDITABILITY: every text span becomes a real
 * PowerPoint text box. Every colored rectangle becomes a real shape. SVGs
 * are embedded as PNGs (they'd be too complex to reconstruct as shapes, and
 * usually they're icons/decorations — the editable text nearby is what
 * matters). Tables stay as native PPT tables.
 */

require("./lib/bootstrap");

const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const brandMod = require("./brand");

const PX_PER_INCH = 96;

function parseArgs(argv) {
  const args = {
    json: null,
    out: "output.pptx",
    useBackgroundImages: false,
    debug: false,
    brand: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--use-background-images") args.useBackgroundImages = true;
    else if (a === "--brand") args.brand = argv[++i];
    else if (a === "--debug") args.debug = true;
    else if (!a.startsWith("--")) args.json = a;
  }
  if (!args.json) {
    console.error("Usage: build.js <slide-data.json> [--out output.pptx] [--brand brand.yaml] [--use-background-images]");
    process.exit(2);
  }
  return args;
}

const pxToIn = (px) => Math.max(0, px / PX_PER_INCH);
// CSS px → pt: browsers use 1 CSS px = 0.75 pt. PPT renders this accurately.
const pxToPt = (px) => px * 0.75;

function normalizeFontFamily(cssFamily) {
  if (!cssFamily) return "Calibri";
  // Take first family, strip quotes
  const first = cssFamily.split(",")[0].replace(/["']/g, "").trim();
  // PowerPoint on most systems has these; fall back appropriately.
  // "Segoe UI" is Microsoft-proprietary and not on Mac by default — when PPT
  // can't find it, it substitutes a wider fallback (often Cambria), causing
  // text to wrap or the file to fail to open. Calibri ships with every Office
  // install and has metrics very close to Segoe UI.
  const fallbacks = {
    "-apple-system": "Calibri",
    "system-ui": "Calibri",
    "BlinkMacSystemFont": "Calibri",
    "Segoe UI": "Calibri",
  };
  return fallbacks[first] || first;
}

function clampBbox(bbox, slideW, slideH) {
  const x = Math.max(0, Math.min(bbox.x, slideW));
  const y = Math.max(0, Math.min(bbox.y, slideH));
  const w = Math.max(0.01, Math.min(bbox.w, slideW - x));
  const h = Math.max(0.01, Math.min(bbox.h, slideH - y));
  return { x, y, w, h };
}

function addShapeLayer(pres, slide, layer, sW, sH) {
  const bbox = clampBbox(layer.bbox, sW, sH);

  // Gradient shapes can't be rendered as native PPT shape fills. If we have
  // a screenshot of the gradient element, place it as an image layer instead
  // (still editable: overlaid text layers remain real text boxes).
  if (layer.hasGradient && layer.dataUrl) {
    slide.addImage({
      x: pxToIn(bbox.x),
      y: pxToIn(bbox.y),
      w: pxToIn(bbox.w),
      h: pxToIn(bbox.h),
      data: layer.dataUrl.replace(/^data:/, ""),
    });
    return;
  }

  // Use ROUNDED_RECTANGLE if radius > ~2px, otherwise plain RECTANGLE
  const useRounded = layer.radius && layer.radius >= 2;
  const shapeType = useRounded ? pres.shapes.ROUNDED_RECTANGLE : pres.shapes.RECTANGLE;

  const opts = {
    x: pxToIn(bbox.x),
    y: pxToIn(bbox.y),
    w: pxToIn(bbox.w),
    h: pxToIn(bbox.h),
  };

  if (layer.fill) {
    opts.fill = { color: layer.fill };
    if (layer.fillAlpha !== undefined && layer.fillAlpha < 1) {
      opts.fill.transparency = Math.round((1 - layer.fillAlpha) * 100);
    }
  } else {
    opts.fill = { type: "none" };
  }

  if (layer.border) {
    opts.line = { color: layer.border.color, width: Math.max(0.5, layer.border.width * 0.75) };
  } else {
    opts.line = { type: "none" };
  }

  if (useRounded) {
    // rectRadius is a fraction of the shorter side (0-0.5 in pptxgenjs)
    const shortSide = Math.min(bbox.w, bbox.h);
    const radiusIn = pxToIn(layer.radius);
    const shortIn = pxToIn(shortSide);
    // Convert to a fraction; cap at 0.5
    opts.rectRadius = Math.min(0.5, radiusIn / shortIn);
  }

  slide.addShape(shapeType, opts);

  // Partial borders (e.g. border-top-only accent strips) are emitted as
  // thin filled rectangles after the main shape.
  if (layer.partialBorder) {
    const pb = layer.partialBorder;
    const c = pb.color;
    const sides = pb.sides || {};
    const inX = pxToIn(bbox.x);
    const inY = pxToIn(bbox.y);
    const inW = pxToIn(bbox.w);
    const inH = pxToIn(bbox.h);
    const mk = (x, y, w, h) =>
      slide.addShape(pres.shapes.RECTANGLE, {
        x, y, w, h,
        fill: { color: c }, line: { type: "none" },
      });
    if (sides.top) mk(inX, inY, inW, pxToIn(sides.top));
    if (sides.bottom) mk(inX, inY + inH - pxToIn(sides.bottom), inW, pxToIn(sides.bottom));
    if (sides.left) mk(inX, inY, pxToIn(sides.left), inH);
    if (sides.right) mk(inX + inW - pxToIn(sides.right), inY, pxToIn(sides.right), inH);
  }
}

function addTextLayer(pres, slide, layer, sW, sH) {
  const bbox = clampBbox(layer.bbox, sW, sH);
  const st = layer.style || {};

  // Build text content: either rich runs or a single string.
  const applyCase = (s) => {
    if (st.textTransform === "uppercase") return s.toUpperCase();
    if (st.textTransform === "lowercase") return s.toLowerCase();
    return s;
  };

  let textContent;
  if (Array.isArray(layer.runs) && layer.runs.length > 0) {
    const outerSize = st.fontSize || 14;
    const outerColor = st.color || "000000";
    textContent = layer.runs.map((run) => {
      const runOpts = {
        color: run.color || outerColor,
        bold: !!run.bold,
        italic: !!run.italic,
        underline: !!run.underline,
      };
      // Only emit per-run fontSize if it differs meaningfully from outer.
      if (run.fontSize && Math.abs(run.fontSize - outerSize) > 0.5) {
        runOpts.fontSize = Math.max(4, pxToPt(run.fontSize));
      }
      if (run.breakLine) runOpts.breakLine = true;
      return { text: applyCase(run.text || ""), options: runOpts };
    });
  } else {
    textContent = applyCase(layer.text || "");
  }

  // Widen horizontally: PPT font metrics are slightly wider than the browser
  // for the same px/pt, and pptxgenjs text boxes have small internal insets
  // even with margin:0. Grow the box so text doesn't wrap more aggressively
  // than it did in HTML. For center/right we grow symmetrically/leftward;
  // left-aligned grows rightward.
  const widthPadPx = 4;
  const widthPadFrac = 0.06;
  const extraW = widthPadPx + bbox.w * widthPadFrac;
  let boxX = bbox.x;
  let boxW = bbox.w + extraW;
  if (st.align === "center") {
    boxX = bbox.x - extraW / 2;
    boxW = bbox.w + extraW;
  } else if (st.align === "right") {
    boxX = bbox.x - extraW;
    boxW = bbox.w + extraW;
  }
  if (boxX < 0) { boxW += boxX; boxX = 0; }
  if (boxX + boxW > sW) boxW = sW - boxX;

  // Vertical placement: expand the box ABOVE and BELOW the measured text
  // and let PPT center the text inside. pptxgenjs text boxes have internal
  // top/bottom padding that's hard to zero out and varies with font size —
  // with valign:top, small text (pill labels) renders visibly below where
  // the HTML shows it. Centering around the measured text midpoint with a
  // symmetric vertical pad makes the rendered position match the browser
  // regardless of pptxgenjs's internal insets.
  const vpadIn = 0.08; // ~6px above + below; plenty for PPT's insets
  const boxYIn = Math.max(0, pxToIn(bbox.y) - vpadIn);
  const boxHIn = pxToIn(bbox.h) + vpadIn * 2;

  const opts = {
    x: pxToIn(boxX),
    y: boxYIn,
    w: pxToIn(boxW),
    h: boxHIn,
    fontSize: Math.max(4, pxToPt(st.fontSize || 14)),
    fontFace: normalizeFontFamily(st.fontFamily),
    color: st.color || "000000",
    bold: (st.fontWeight || 400) >= 600,
    italic: !!st.italic,
    underline: !!st.underline,
    align: st.align === "center" ? "center" : st.align === "right" ? "right" : "left",
    valign: "middle",
    margin: 0,
    isTextBox: true,
    fit: "none",
    wrap: true,
  };

  // charSpacing in pptxgenjs is measured in points. CSS letter-spacing
  // in px → pt = × 0.75. Skip very small values (visual artifacts). Cap
  // at ±4pt to prevent decorative uppercase labels from running away.
  if (st.letterSpacing && Math.abs(st.letterSpacing) >= 0.3) {
    const csPt = pxToPt(st.letterSpacing);
    opts.charSpacing = Math.max(-4, Math.min(4, csPt));
  }

  slide.addText(textContent, opts);
}

function addImageLayer(pres, slide, layer, sW, sH) {
  const bbox = clampBbox(layer.bbox, sW, sH);
  if (!layer.dataUrl && !layer.src) return;
  const opts = {
    x: pxToIn(bbox.x),
    y: pxToIn(bbox.y),
    w: pxToIn(bbox.w),
    h: pxToIn(bbox.h),
  };
  if (layer.dataUrl) {
    // pptxgenjs wants data URL without the "data:" prefix, in the form
    // "image/png;base64,..." — strip leading "data:" if present.
    opts.data = layer.dataUrl.replace(/^data:/, "");
  } else {
    opts.path = layer.src;
  }
  slide.addImage(opts);
}

function addTableLayer(pres, slide, layer, sW, sH) {
  const bbox = clampBbox(layer.bbox, sW, sH);
  const fontFace = normalizeFontFamily(layer.fontFamily);
  const rows = (layer.rows || []).map((row) =>
    row.map((cell) => ({
      text: cell.text || "",
      options: {
        fill: cell.fill ? { color: cell.fill } : undefined,
        color: cell.color || "000000",
        fontSize: Math.max(6, pxToPt(cell.fontSize || 11)),
        fontFace,
        bold: !!cell.bold,
        align: cell.align || "left",
        valign: "middle",
        margin: 0.04,
      },
    }))
  );
  if (rows.length === 0) return;
  slide.addTable(rows, {
    x: pxToIn(bbox.x),
    y: pxToIn(bbox.y),
    w: pxToIn(bbox.w),
    h: pxToIn(bbox.h),
    border: { pt: 0.25, color: "E8E8E8" },
    fontFace,
  });
}

function addImagePlaceholder(pres, slide, layer, sW, sH) {
  const bbox = clampBbox(layer.bbox, sW, sH);
  // Dashed-border rectangle with "Missing image: filename" label. Uses a
  // neutral fill so it's obvious the slide has a gap but doesn't scream.
  slide.addShape(pres.shapes.RECTANGLE, {
    x: pxToIn(bbox.x),
    y: pxToIn(bbox.y),
    w: pxToIn(bbox.w),
    h: pxToIn(bbox.h),
    fill: { color: "F0F0F0" },
    line: { color: "C84C4C", width: 1.5, dashType: "dash" },
  });
  slide.addText(
    `Missing image:\n${layer.filename || "(unknown)"}`,
    {
      x: pxToIn(bbox.x),
      y: pxToIn(bbox.y),
      w: pxToIn(bbox.w),
      h: pxToIn(bbox.h),
      fontSize: 14,
      fontFace: "Calibri",
      color: "C84C4C",
      bold: true,
      align: "center",
      valign: "middle",
      margin: 8,
      isTextBox: true,
    }
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const data = JSON.parse(fs.readFileSync(args.json, "utf8"));

  // Load brand config if specified
  let brand = null;
  if (args.brand) {
    try {
      brand = brandMod.loadBrand(args.brand);
      console.error(`Loaded brand config from ${args.brand}`);
    } catch (e) {
      console.error(`Failed to load brand config: ${e.message}`);
      if (args.debug) throw e;
      // Continue without brand rather than fail the build
    }
  }

  const sW = data.slideWidthPx;
  const sH = data.slideHeightPx;
  const slideWIn = pxToIn(sW);
  const slideHIn = pxToIn(sH);

  const pres = new pptxgen();
  pres.defineLayout({ name: "HTML_DECK", width: slideWIn, height: slideHIn });
  pres.layout = "HTML_DECK";

  // Metadata: brand overrides default, HTML has no say in this
  if (brand && brand.metadata) {
    if (brand.metadata.title) pres.title = brand.metadata.title;
    else pres.title = "Converted from HTML";
    if (brand.metadata.author) pres.author = brand.metadata.author;
    else pres.author = "html-to-pptx";
    if (brand.metadata.company) pres.company = brand.metadata.company;
  } else {
    pres.title = "Converted from HTML";
    pres.author = "html-to-pptx";
  }

  const totalPages = data.slides.length;

  for (let pageIdx = 0; pageIdx < data.slides.length; pageIdx++) {
    const sd = data.slides[pageIdx];
    const slide = pres.addSlide();

    // Background priority: (1) full-render screenshot if explicitly requested,
    // (2) slide-root gradient screenshot if captured, (3) solid background
    // color, (4) white default.
    if (args.useBackgroundImages && sd.fullRenderDataUrl) {
      slide.background = { data: sd.fullRenderDataUrl.replace(/^data:/, "") };
    } else if (sd.backgroundImageDataUrl) {
      slide.background = { data: sd.backgroundImageDataUrl.replace(/^data:/, "") };
    } else if (sd.backgroundColor) {
      slide.background = { color: sd.backgroundColor };
    } else {
      slide.background = { color: "FFFFFF" };
    }

    for (const layer of sd.layers) {
      try {
        if (layer.type === "shape") {
          // When using background images, skip shapes that only add color
          // already visible in the background screenshot — but do emit shapes
          // with borders or distinct fill so rounded corners still look right.
          // Simple rule: always emit shapes. They stack on top and reinforce
          // visual structure. This keeps colored cards editable.
          addShapeLayer(pres, slide, layer, sW, sH);
        } else if (layer.type === "text") {
          addTextLayer(pres, slide, layer, sW, sH);
        } else if (layer.type === "image" || layer.type === "svg") {
          addImageLayer(pres, slide, layer, sW, sH);
        } else if (layer.type === "image_placeholder") {
          addImagePlaceholder(pres, slide, layer, sW, sH);
        } else if (layer.type === "table") {
          addTableLayer(pres, slide, layer, sW, sH);
        }
      } catch (e) {
        console.error(`Slide ${sd.index} layer ${layer.type} failed:`, e.message);
        if (args.debug) throw e;
      }
    }

    // Brand overlays come AFTER all layers so they sit on top.
    if (brand) {
      try {
        applyBrandFooter(pres, slide, sd, brand, pageIdx + 1, totalPages, sW, sH);
        applyBrandLogo(slide, sd, brand, pageIdx, sW, sH);
      } catch (e) {
        console.error(`Slide ${sd.index} brand overlay failed:`, e.message);
        if (args.debug) throw e;
      }
    }
  }

  await pres.writeFile({ fileName: args.out });
  await fixContentTypes(args.out);
  console.error(`Wrote ${args.out}`);
}

// Post-process the PPTX zip to clean up pptxgenjs's known structural quirks
// that cause PowerPoint to flag the file as damaged on open.
//
// Issues fixed here, each discovered by diffing v_n vs PowerPoint's repaired
// version of v_n:
//   1. pptxgenjs emits one <Override PartName=".../slideMasterN.xml"/> per
//      slide in [Content_Types].xml, but only writes slideMaster1.xml. Drop
//      any Override whose PartName isn't an actual entry in the zip.
//   2. pptxgenjs points notesMaster1.xml.rels at theme1.xml — the same theme
//      file the slide master owns. PowerPoint expects each master to have
//      its own theme. Create theme2.xml as a copy of theme1.xml, repoint
//      the notes master rels there, and declare it in [Content_Types].xml.
//   3. presentation.xml emits <p:notesMasterIdLst> AFTER <p:sldIdLst>. The
//      OOXML schema for <p:presentation> requires the strict order
//      sldMasterIdLst → notesMasterIdLst → handoutMasterIdLst → sldIdLst →
//      sldSz → notesSz → ... Move notesMasterIdLst before sldIdLst.
//   4. notesSlide{N}.xml contains an empty <a:r><a:rPr lang="en-US"
//      dirty="0"/><a:t></a:t></a:r> in every notes slide. Empty runs are
//      flagged as invalid. Strip them.
//   5. slideMaster1.xml is missing <p:bg>. The schema for <p:sldMaster>/
//      <p:cSld> requires it. Inject a default <p:bgRef idx="1001"/>.
//   6. Slide XMLs (and others) have <p:cNvPr ...>    </p:cNvPr> with
//      whitespace-only content. CT_NonVisualDrawingProps is element-only;
//      collapse to self-closing <p:cNvPr .../>.
//
// Inferred by diffing v7 against PowerPoint's repaired-v7 to see exactly
// which bytes PowerPoint considered worth changing.
async function fixContentTypes(pptxPath) {
  const JSZip = require("jszip");
  const buf = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(buf);
  let dirty = false;

  // -------- (1) Strip Overrides for parts that aren't in the zip --------
  const ctName = "[Content_Types].xml";
  const ctFile = zip.file(ctName);
  if (ctFile) {
    const present = new Set(Object.keys(zip.files));
    let ct = await ctFile.async("string");

    let stripped = 0;
    ct = ct.replace(/<Override\s+PartName="([^"]+)"[^>]*\/>/g, (match, part) => {
      const zipPath = part.replace(/^\//, "");
      if (!present.has(zipPath)) {
        stripped++;
        return "";
      }
      return match;
    });

    if (stripped > 0) {
      zip.file(ctName, ct);
      console.error(`Stripped ${stripped} dangling Override(s) from [Content_Types].xml`);
      dirty = true;
    }
  }

  // -------- (2) Give notesMaster1 its own theme (theme2.xml) -----------
  const notesRelsPath = "ppt/notesMasters/_rels/notesMaster1.xml.rels";
  const themeOnePath = "ppt/theme/theme1.xml";
  const themeTwoPath = "ppt/theme/theme2.xml";
  const notesRelsFile = zip.file(notesRelsPath);
  if (notesRelsFile && !zip.file(themeTwoPath)) {
    let rels = await notesRelsFile.async("string");
    if (rels.includes('Target="../theme/theme1.xml"')) {
      // Copy theme1 → theme2
      const theme1 = await zip.file(themeOnePath).async("string");
      zip.file(themeTwoPath, theme1);

      // Repoint the notes master at the new theme
      rels = rels.replace('Target="../theme/theme1.xml"', 'Target="../theme/theme2.xml"');
      zip.file(notesRelsPath, rels);

      // Declare theme2 in [Content_Types].xml
      let ct = await zip.file(ctName).async("string");
      const theme2Override =
        '<Override PartName="/ppt/theme/theme2.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>';
      ct = ct.replace("</Types>", theme2Override + "</Types>");
      zip.file(ctName, ct);

      console.error("Added theme2.xml for notesMaster1 (was sharing theme1)");
      dirty = true;
    }
  }

  // -------- (3) Reorder notesMasterIdLst before sldIdLst in presentation.xml
  const presPath = "ppt/presentation.xml";
  const presFile = zip.file(presPath);
  if (presFile) {
    let pres = await presFile.async("string");
    const sldIdIdx = pres.indexOf("<p:sldIdLst");
    const notesIdMatch = pres.match(/<p:notesMasterIdLst[\s\S]*?<\/p:notesMasterIdLst>/);
    if (sldIdIdx >= 0 && notesIdMatch && notesIdMatch.index > sldIdIdx) {
      const notesBlock = notesIdMatch[0];
      // Strip the misplaced block, then re-insert before <p:sldIdLst
      pres = pres.replace(notesBlock, "");
      pres = pres.replace("<p:sldIdLst", notesBlock + "<p:sldIdLst");
      zip.file(presPath, pres);
      console.error("Reordered presentation.xml: notesMasterIdLst → before sldIdLst");
      dirty = true;
    }
  }

  // -------- (4) Strip empty runs from notesSlide{N}.xml ---------------------
  const notesSlidePaths = Object.keys(zip.files).filter((p) =>
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)
  );
  let strippedRuns = 0;
  for (const p of notesSlidePaths) {
    let ns = await zip.file(p).async("string");
    const before = ns.length;
    // Strip empty runs — either form: <a:t/> or <a:t></a:t>
    ns = ns.replace(
      /<a:r>\s*<a:rPr[^/]*\/>\s*<a:t\s*(?:\/>|><\/a:t>)\s*<\/a:r>/g,
      ""
    );
    if (ns.length !== before) {
      zip.file(p, ns);
      strippedRuns++;
    }
  }
  if (strippedRuns > 0) {
    console.error(`Stripped empty <a:t/> runs from ${strippedRuns} notesSlide(s)`);
    dirty = true;
  }

  // -------- (5) Add <p:bg> to slideMaster1.xml if missing ------------------
  // The OOXML schema for slideMaster's <p:cSld> requires a <p:bg> element
  // (or it must explicitly inherit from elsewhere). pptxgenjs omits it and
  // PowerPoint's repair injects a default <p:bgRef idx="1001"/>.
  const sldMasterPath = "ppt/slideMasters/slideMaster1.xml";
  const sldMasterFile = zip.file(sldMasterPath);
  if (sldMasterFile) {
    let sm = await sldMasterFile.async("string");
    if (!sm.includes("<p:bg>") && !sm.includes("<p:bg/>")) {
      const bgBlock =
        '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>';
      // Inject right after <p:cSld>
      sm = sm.replace("<p:cSld>", "<p:cSld>" + bgBlock);
      zip.file(sldMasterPath, sm);
      console.error("Injected <p:bg> into slideMaster1.xml");
      dirty = true;
    }
  }

  // -------- (6) Self-close every empty open-close pair across all XML files
  // pptxgenjs emits LOTS of empty elements as <tag attrs></tag> (and a few
  // as <tag attrs>WHITESPACE</tag>). The OOXML schemas for many of these
  // (CT_NonVisualDrawingProps, CT_NonVisualPictureProperties, CT_AVLst,
  // CT_TextBodyProperties, etc.) are element-only content models — mixed
  // text content is not in the spec. Comparing v9 against PowerPoint's
  // repaired-v9 on slide1 shows 73 empty open-close pairs in v9 vs ZERO
  // in repaired: p:nvPr (20), p:cNvPr (13), a:ln (12), a:avLst (11),
  // a:bodyPr (10), a:blip (7). PowerPoint normalizes every one to
  // self-closing during repair.
  //
  // XML-equivalence: <tag attrs></tag> and <tag attrs/> are identical for
  // any element. This is a safe cosmetic transform — but evidently one
  // PowerPoint cares about for accepting the file without repair.
  let pairsCollapsed = 0;
  let pairsCollapsedFiles = 0;
  for (const filename of Object.keys(zip.files)) {
    if (!/\.xml$/.test(filename)) continue;
    if (filename === ctName) continue;
    let xml = await zip.file(filename).async("string");
    let count = 0;
    // Collapse <tag attrs?>(whitespace?)</tag> to <tag attrs?/>.
    //
    // CRITICAL: the (?![\w:]) negative lookahead anchors the tag-name
    // match. Without it the regex engine backtracks the tag name when the
    // \1 backreference fails to find a matching closing tag. Example:
    //   input:  <p:spPr/></p:sp><p:sp>...
    //   bad:    tag=`p:sp`, attrs=`Pr/`, finds </p:sp>, produces <p:spPr//>
    //           (invalid XML — parser breaks on `//>` → PowerPoint flags damage)
    // The lookahead forces tag to consume all consecutive name chars so
    // it can't shrink to a prefix that happens to be a valid close-tag.
    xml = xml.replace(
      /<([a-zA-Z][\w:]*)(?![\w:])([^>]*?)>\s*<\/\1>/g,
      (_m, tag, attrs) => {
        count++;
        return `<${tag}${attrs}/>`;
      }
    );
    if (count > 0) {
      pairsCollapsed += count;
      pairsCollapsedFiles++;
      zip.file(filename, xml);
    }
  }
  if (pairsCollapsed > 0) {
    console.error(`Collapsed ${pairsCollapsed} empty open-close pair(s) across ${pairsCollapsedFiles} XML file(s)`);
    dirty = true;
  }

  // -------- (7) Fix unescaped `&` in docProps (and other XML files) --------
  // pptxgenjs writes pres.title / pres.author / pres.company directly into
  // docProps/app.xml and docProps/core.xml WITHOUT XML-escaping. A brand
  // value like "Creed & Iron Construction, LLC" lands in the XML as a raw
  // `&`, which makes the file unparseable XML. PowerPoint flags this as
  // damaged. Defensively scan every XML file and replace any `&` not
  // already part of an entity reference with `&amp;`.
  let ampsFixed = 0;
  for (const filename of Object.keys(zip.files)) {
    if (!/\.xml$/.test(filename)) continue;
    let xml = await zip.file(filename).async("string");
    let fileCount = 0;
    const newXml = xml.replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);)/g, () => {
      fileCount++;
      return "&amp;";
    });
    if (fileCount > 0) {
      ampsFixed += fileCount;
      zip.file(filename, newXml);
    }
  }
  if (ampsFixed > 0) {
    console.error(`Fixed ${ampsFixed} unescaped '&' across XML files`);
    dirty = true;
  }

  if (dirty) {
    const out = await zip.generateAsync({ type: "nodebuffer" });
    fs.writeFileSync(pptxPath, out);
  }
}


// ---- Brand overlay helpers -------------------------------------------------

function applyBrandFooter(pres, slide, sd, brand, pageNum, totalPages, sW, sH) {
  if (!brand.footer) return;
  const f = brand.footer;
  if (f.skip_if_html_has_footer && brandMod.slideHasExistingFooter(sd, sH)) return;
  const left = brandMod.interpolateFooter(f.left, pageNum, totalPages);
  const center = brandMod.interpolateFooter(f.center, pageNum, totalPages);
  const right = brandMod.interpolateFooter(f.right, pageNum, totalPages);
  if (!left && !center && !right) return;

  const color = f.color || brandMod.pickFooterColor(sd);
  const fontSize = f.font_size || 9;

  // Footer band: bottom ~4% of slide, full width, with a 0.5" horizontal margin.
  const bandHIn = 0.3;
  const yIn = pxToIn(sH) - bandHIn - 0.08;
  const xMarginIn = 0.5;
  const availW = pxToIn(sW) - 2 * xMarginIn;
  const colW = availW / 3;

  const commonOpts = {
    y: yIn,
    h: bandHIn,
    fontSize,
    color,
    fontFace: "Calibri",
    margin: 0,
    isTextBox: true,
    valign: "middle",
  };

  if (left) {
    slide.addText(left, { ...commonOpts, x: xMarginIn, w: colW, align: "left" });
  }
  if (center) {
    slide.addText(center, {
      ...commonOpts,
      x: xMarginIn + colW,
      w: colW,
      align: "center",
    });
  }
  if (right) {
    slide.addText(right, {
      ...commonOpts,
      x: xMarginIn + colW * 2,
      w: colW,
      align: "right",
    });
  }
}

function applyBrandLogo(slide, sd, brand, slideIdx, sW, sH) {
  if (!brand.logo) return;
  const L = brand.logo;
  if (L.skip_on_cover && slideIdx === 0) return;

  const wIn = L.width_in;
  const mIn = L.margin_in;
  const slideWIn = pxToIn(sW);
  const slideHIn = pxToIn(sH);

  // We don't know the logo's aspect ratio without reading the image.
  // Let pptxgenjs auto-size by passing `sizing: contain` with a tall box.
  // Simpler: fix width, let height be square-ish (common for logos) or
  // trust the user's width_in. We use `path` + width only; pptxgenjs will
  // read the image and preserve aspect ratio when only one dimension is set.

  let x, y;
  const placement = (L.placement || "top-right").toLowerCase();
  const hIn = wIn; // fall back — pptxgenjs requires both; this may squish
  // non-square logos. The override below uses the `sizing` option to let
  // PPT render the logo at its natural aspect ratio inside this box.

  if (placement === "top-left") {
    x = mIn;
    y = mIn;
  } else if (placement === "top-right") {
    x = slideWIn - wIn - mIn;
    y = mIn;
  } else if (placement === "bottom-left") {
    x = mIn;
    y = slideHIn - hIn - mIn;
  } else if (placement === "bottom-right") {
    x = slideWIn - wIn - mIn;
    y = slideHIn - hIn - mIn;
  } else {
    console.error(`Unknown logo placement: ${placement}`);
    return;
  }

  slide.addImage({
    path: L.path,
    x,
    y,
    w: wIn,
    h: hIn,
    sizing: { type: "contain", w: wIn, h: hIn },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
