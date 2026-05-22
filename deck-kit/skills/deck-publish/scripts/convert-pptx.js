#!/usr/bin/env node

/**
 * Convert an HTML file to PowerPoint (PPTX) using Puppeteer screenshots + pptxgenjs.
 *
 * Approach: Render HTML in Chrome, detect slide elements, screenshot each one
 * individually at high resolution, embed screenshots as full-bleed slides in PPTX.
 *
 * Usage: node convert-pptx.js <input.html> <output.pptx> [options]
 *
 * Output: JSON to stdout { success, output, size, slides } or { success: false, error }
 */

require('./lib/bootstrap');

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { launchBrowser, loadPage } = require('./lib/browser');
const PptxGenJS = require('pptxgenjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    input: null,
    output: null,
    slideSize: '16:9',
    quality: 2,
    viewportWidth: 1280,
    splitBy: 'auto',
    slideSelector: null,
    imageFormat: 'webp-lossless',
    imageQuality: 95,
    wait: 0,
    waitForFonts: false,
    waitForSelector: null,
    timeout: 60000,
    editable: false,
    brand: null,
    noBrand: false,
    useBackgroundImages: false,
  };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--slide-size') opts.slideSize = args[++i];
    else if (arg === '--quality') opts.quality = parseInt(args[++i], 10);
    else if (arg === '--viewport-width') opts.viewportWidth = parseInt(args[++i], 10);
    else if (arg === '--split-by') opts.splitBy = args[++i];
    else if (arg === '--slide-selector') opts.slideSelector = args[++i];
    else if (arg === '--image-format') opts.imageFormat = args[++i];
    else if (arg === '--image-quality') opts.imageQuality = parseInt(args[++i], 10);
    else if (arg === '--wait') opts.wait = parseInt(args[++i], 10);
    else if (arg === '--wait-for-fonts') opts.waitForFonts = true;
    else if (arg === '--wait-for-selector') opts.waitForSelector = args[++i];
    else if (arg === '--timeout') opts.timeout = parseInt(args[++i], 10);
    else if (arg === '--editable') opts.editable = true;
    else if (arg === '--brand') opts.brand = args[++i];
    else if (arg === '--no-brand') opts.noBrand = true;
    else if (arg === '--use-background-images') opts.useBackgroundImages = true;
    else if (!arg.startsWith('--')) positional.push(arg);
  }

  opts.input = positional[0];
  opts.output = positional[1];
  return opts;
}

/**
 * Auto-detect slide elements in the page.
 * Tries multiple strategies in order:
 * 1. User-provided CSS selector
 * 2. data-slide attributes
 * 3. Fixed-size elements with page-break-after (slide-deck pattern)
 * 4. CSS page-break-before elements
 * 5. Fallback: viewport-height chunks
 *
 * Returns { elements: true, selector: string, width, height } for element-based,
 * or { regions: [{top, height}] } for region-based fallback.
 */
async function detectSlides(page, splitBy, slideSelector) {
  // User-specified selector
  if (slideSelector) {
    const info = await page.evaluate((sel) => {
      const els = document.querySelectorAll(sel);
      if (els.length === 0) return null;
      const first = els[0].getBoundingClientRect();
      return { count: els.length, width: first.width, height: first.height };
    }, slideSelector);
    if (info) return { elements: true, selector: slideSelector, ...info };
    return null;
  }

  // data-slide attributes
  if (splitBy === 'auto' || splitBy === 'data-slide') {
    const info = await page.evaluate(() => {
      const els = document.querySelectorAll('[data-slide]');
      if (els.length === 0) return null;
      const first = els[0].getBoundingClientRect();
      return { count: els.length, width: first.width, height: first.height };
    });
    if (info) return { elements: true, selector: '[data-slide]', ...info };
    if (splitBy === 'data-slide') return null;
  }

  // Fixed-size elements with page-break-after (common slide-deck HTML pattern)
  if (splitBy === 'auto' || splitBy === 'page-breaks') {
    const info = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const withBreaks = all.filter((el) => {
        const style = window.getComputedStyle(el);
        return (
          style.pageBreakAfter === 'always' ||
          style.breakAfter === 'page' ||
          style.pageBreakBefore === 'always' ||
          style.breakBefore === 'page'
        );
      });

      if (withBreaks.length < 2) return null;

      // Check if they share fixed dimensions (slide-deck pattern)
      const first = withBreaks[0].getBoundingClientRect();
      if (first.width < 100 || first.height < 100) return null;

      const allSameSize = withBreaks.every((el) => {
        const rect = el.getBoundingClientRect();
        return Math.abs(rect.width - first.width) < 2 && Math.abs(rect.height - first.height) < 2;
      });

      if (!allSameSize) return null;

      // Build a selector that matches these elements
      // Try common patterns: class-based, tag-based
      const tag = withBreaks[0].tagName.toLowerCase();
      const classes = Array.from(withBreaks[0].classList);

      let selector = null;
      for (const cls of classes) {
        const matched = document.querySelectorAll(`.${cls}`);
        if (matched.length === withBreaks.length) {
          selector = `.${cls}`;
          break;
        }
      }

      if (!selector) {
        // Fallback: use the tag + page-break style as identifier
        // We'll return element positions instead
        return {
          count: withBreaks.length,
          width: first.width,
          height: first.height,
          positions: withBreaks.map((el) => {
            const rect = el.getBoundingClientRect();
            return { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height };
          }),
        };
      }

      return { count: withBreaks.length, width: first.width, height: first.height, selector };
    });

    if (info) {
      if (info.selector) {
        return { elements: true, selector: info.selector, count: info.count, width: info.width, height: info.height };
      }
      // Have positions but no clean selector — use region-based approach
      return { regions: info.positions, width: info.width, height: info.height, count: info.count };
    }
    if (splitBy === 'page-breaks') return null;
  }

  // Fallback: viewport-height chunks
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportHeight = (await page.viewport()).height;
  const regions = [];
  for (let top = 0; top < docHeight; top += viewportHeight) {
    regions.push({ top, height: Math.min(viewportHeight, docHeight - top) });
  }
  return { regions, count: regions.length };
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.input) {
    console.log(JSON.stringify({ success: false, error: 'No input file specified' }));
    process.exit(1);
  }

  if (!opts.output) {
    const base = path.basename(opts.input, path.extname(opts.input));
    opts.output = path.join(path.dirname(opts.input), `${base}.pptx`);
  }

  opts.input = path.resolve(opts.input);
  opts.output = path.resolve(opts.output);

  if (!fs.existsSync(opts.input)) {
    console.log(JSON.stringify({ success: false, error: `Input file not found: ${opts.input}` }));
    process.exit(1);
  }

  // Delegate to the editable pipeline before doing any screenshot setup.
  // Editable mode produces real PowerPoint shapes/text boxes via extract.js
  // + build.js instead of a full-slide screenshot per slide.
  if (opts.editable) {
    const { spawnSync } = require('child_process');
    const editableScript = path.join(__dirname, 'convert-pptx-editable.js');
    const editableArgs = [editableScript, opts.input, '--out', opts.output];
    if (opts.slideSelector) editableArgs.push('--selector', opts.slideSelector);
    if (opts.brand) editableArgs.push('--brand', opts.brand);
    if (opts.noBrand) editableArgs.push('--no-brand');
    if (opts.useBackgroundImages) editableArgs.push('--use-background-images');
    const r = spawnSync('node', editableArgs, { stdio: 'inherit' });
    process.exit(r.status || 0);
  }

  let browser;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'html2pptx-'));
  const tempFiles = [];

  try {
    browser = await launchBrowser();

    // First load with a reasonable viewport to detect slide structure
    const page = await loadPage(browser, opts.input, {
      wait: opts.wait,
      waitForFonts: opts.waitForFonts,
      waitForSelector: opts.waitForSelector,
      timeout: opts.timeout,
      viewportWidth: opts.viewportWidth,
      viewportHeight: 720,
      deviceScaleFactor: opts.quality,
    });

    const detection = await detectSlides(page, opts.splitBy, opts.slideSelector);
    if (!detection || detection.count === 0) {
      throw new Error('No slide sections detected in the HTML document');
    }

    // Determine actual slide pixel dimensions from the detected elements
    const slideW = detection.width || opts.viewportWidth;
    const slideH = detection.height || Math.round(opts.viewportWidth * 7.5 / 13.33);

    // Calculate PPTX dimensions in inches based on aspect ratio
    const aspectRatio = slideW / slideH;
    let pptxW, pptxH;
    if (opts.slideSize === '4:3') {
      pptxW = 10;
      pptxH = 7.5;
    } else {
      // Use actual aspect ratio from the HTML slides
      pptxH = 7.5;
      pptxW = pptxH * aspectRatio;
    }

    // If we detected fixed-size elements, resize viewport to match their dimensions
    // so screenshots capture them at native size
    if (detection.width && detection.height) {
      await page.setViewport({
        width: Math.ceil(detection.width),
        height: Math.ceil(detection.height),
        deviceScaleFactor: opts.quality,
      });
      // Reload to re-render at correct viewport
      const url = require('url');
      await page.goto(url.pathToFileURL(opts.input).href, {
        waitUntil: 'networkidle0',
        timeout: opts.timeout,
      });
      if (opts.waitForFonts) await page.evaluate(() => document.fonts.ready);
      if (opts.wait > 0) await new Promise((r) => setTimeout(r, opts.wait));
    }

    // Determine screenshot format and MIME type
    // Formats: webp-lossless (default), webp, png, jpeg
    const fmt = opts.imageFormat;
    let screenshotType, screenshotExt, mimeType, screenshotOpts;

    if (fmt === 'png') {
      screenshotType = 'png';
      screenshotExt = '.png';
      mimeType = 'image/png';
      screenshotOpts = {};
    } else if (fmt === 'jpeg' || fmt === 'jpg') {
      screenshotType = 'jpeg';
      screenshotExt = '.jpg';
      mimeType = 'image/jpeg';
      screenshotOpts = { quality: opts.imageQuality };
    } else if (fmt === 'webp') {
      screenshotType = 'webp';
      screenshotExt = '.webp';
      mimeType = 'image/webp';
      screenshotOpts = { quality: opts.imageQuality };
    } else {
      // webp-lossless (default) — best compression with zero quality loss
      screenshotType = 'webp';
      screenshotExt = '.webp';
      mimeType = 'image/webp';
      screenshotOpts = { quality: 100 };
    }

    // Screenshot each slide
    const screenshots = [];

    if (detection.elements && detection.selector) {
      // Element-based: screenshot each matched element directly
      const elementHandles = await page.$$(detection.selector);
      for (let i = 0; i < elementHandles.length; i++) {
        const imgPath = path.join(tempDir, `slide-${i}${screenshotExt}`);
        await elementHandles[i].screenshot({ path: imgPath, type: screenshotType, ...screenshotOpts });
        screenshots.push(imgPath);
        tempFiles.push(imgPath);
      }
    } else if (detection.regions) {
      // Region-based: clip screenshot to each region
      for (let i = 0; i < detection.regions.length; i++) {
        const region = detection.regions[i];
        const imgPath = path.join(tempDir, `slide-${i}${screenshotExt}`);
        await page.screenshot({
          path: imgPath,
          clip: {
            x: region.left || 0,
            y: region.top,
            width: region.width || slideW,
            height: region.height,
          },
          type: screenshotType,
          ...screenshotOpts,
        });
        screenshots.push(imgPath);
        tempFiles.push(imgPath);
      }
    }

    await browser.close();
    browser = null;

    const pptx = new PptxGenJS();

    pptx.defineLayout({
      name: 'CUSTOM',
      width: pptxW,
      height: pptxH,
    });
    pptx.layout = 'CUSTOM';

    let totalImageBytes = 0;
    for (const imgPath of screenshots) {
      const slide = pptx.addSlide();
      const imgData = fs.readFileSync(imgPath);
      totalImageBytes += imgData.length;
      const base64 = imgData.toString('base64');

      slide.addImage({
        data: `${mimeType};base64,${base64}`,
        x: 0,
        y: 0,
        w: pptxW,
        h: pptxH,
      });
    }

    await pptx.writeFile({ fileName: opts.output });

    const stat = fs.statSync(opts.output);
    console.log(JSON.stringify({
      success: true,
      output: opts.output,
      size: stat.size,
      slides: screenshots.length,
      slidePixels: `${Math.round(slideW)}x${Math.round(slideH)}`,
      pptxSize: `${pptxW.toFixed(2)}x${pptxH.toFixed(2)}in`,
      imageFormat: fmt,
      totalImageBytes,
    }));
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.log(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  } finally {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    try { fs.rmdirSync(tempDir); } catch {}
  }
}

main();
