#!/usr/bin/env node

/**
 * Convert an HTML file to PDF using Puppeteer + headless Chrome.
 *
 * Usage: node convert-pdf.js <input.html> <output.pdf> [options]
 *
 * Supports two modes:
 * 1. Document mode (default): Standard PDF with configurable paper size/margins
 * 2. Slide mode (--slide-selector): Detects fixed-size slide elements, sets page
 *    size to match exactly, producing tight-fit pages with no whitespace.
 *
 * Output: JSON to stdout { success, output, size } or { success: false, error }
 */

const path = require('path');
const fs = require('fs');
const { launchBrowser, loadPage } = require('./lib/browser');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    input: null,
    output: null,
    format: 'A4',
    landscape: false,
    margin: '1cm',
    marginTop: null,
    marginBottom: null,
    marginLeft: null,
    marginRight: null,
    pageNumbers: false,
    header: '',
    footer: '',
    scale: 1,
    preferCssPageSize: true,
    printBackground: true,
    pageRanges: '',
    wait: 0,
    waitForFonts: false,
    waitForSelector: null,
    timeout: 30000,
    slideSelector: null,
  };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format') opts.format = args[++i];
    else if (arg === '--landscape') opts.landscape = true;
    else if (arg === '--margin') opts.margin = args[++i];
    else if (arg === '--margin-top') opts.marginTop = args[++i];
    else if (arg === '--margin-bottom') opts.marginBottom = args[++i];
    else if (arg === '--margin-left') opts.marginLeft = args[++i];
    else if (arg === '--margin-right') opts.marginRight = args[++i];
    else if (arg === '--page-numbers') opts.pageNumbers = true;
    else if (arg === '--header') opts.header = args[++i];
    else if (arg === '--footer') opts.footer = args[++i];
    else if (arg === '--scale') opts.scale = parseFloat(args[++i]);
    else if (arg === '--prefer-css-page-size') opts.preferCssPageSize = args[++i] !== 'false';
    else if (arg === '--no-prefer-css-page-size') opts.preferCssPageSize = false;
    else if (arg === '--print-background') opts.printBackground = args[++i] !== 'false';
    else if (arg === '--no-print-background') opts.printBackground = false;
    else if (arg === '--page-ranges') opts.pageRanges = args[++i];
    else if (arg === '--wait') opts.wait = parseInt(args[++i], 10);
    else if (arg === '--wait-for-fonts') opts.waitForFonts = true;
    else if (arg === '--wait-for-selector') opts.waitForSelector = args[++i];
    else if (arg === '--timeout') opts.timeout = parseInt(args[++i], 10);
    else if (arg === '--slide-selector') opts.slideSelector = args[++i];
    else if (!arg.startsWith('--')) positional.push(arg);
  }

  opts.input = positional[0];
  opts.output = positional[1];
  return opts;
}

function parseMargins(opts) {
  const parts = opts.margin.trim().split(/\s+/);
  let top, right, bottom, left;

  if (parts.length === 1) {
    top = right = bottom = left = parts[0];
  } else if (parts.length === 2) {
    top = bottom = parts[0];
    right = left = parts[1];
  } else if (parts.length === 4) {
    [top, right, bottom, left] = parts;
  } else {
    top = right = bottom = left = parts[0];
  }

  return {
    top: opts.marginTop || top,
    right: opts.marginRight || right,
    bottom: opts.marginBottom || bottom,
    left: opts.marginLeft || left,
  };
}

const PAGE_NUMBER_FOOTER = `
<div style="font-size: 9px; width: 100%; text-align: center; color: #666; padding: 5px 0;">
  <span class="pageNumber"></span> of <span class="totalPages"></span>
</div>`;

/**
 * Auto-detect slide-deck HTML patterns. Looks for repeated fixed-size elements
 * with page-break-after that share the same dimensions.
 */
async function autoDetectSlides(page) {
  return page.evaluate(() => {
    // Common slide selectors to try
    const candidates = [
      // Elements with explicit page-break-after
      ...Array.from(document.querySelectorAll('*')).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.pageBreakAfter === 'always' || style.breakAfter === 'page';
      }),
    ];

    if (candidates.length < 2) return null;

    // Check if they share the same fixed dimensions
    const first = candidates[0].getBoundingClientRect();
    const allSameSize = candidates.every((el) => {
      const rect = el.getBoundingClientRect();
      return Math.abs(rect.width - first.width) < 2 && Math.abs(rect.height - first.height) < 2;
    });

    if (!allSameSize) return null;

    return {
      count: candidates.length,
      width: first.width,
      height: first.height,
    };
  });
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.input) {
    console.log(JSON.stringify({ success: false, error: 'No input file specified' }));
    process.exit(1);
  }

  if (!opts.output) {
    const base = path.basename(opts.input, path.extname(opts.input));
    opts.output = path.join(path.dirname(opts.input), `${base}.pdf`);
  }

  opts.input = path.resolve(opts.input);
  opts.output = path.resolve(opts.output);

  if (!fs.existsSync(opts.input)) {
    console.log(JSON.stringify({ success: false, error: `Input file not found: ${opts.input}` }));
    process.exit(1);
  }

  let browser;
  try {
    browser = await launchBrowser();
    const page = await loadPage(browser, opts.input, {
      wait: opts.wait,
      waitForFonts: opts.waitForFonts,
      waitForSelector: opts.waitForSelector,
      timeout: opts.timeout,
    });

    // Check for slide-deck pattern: fixed-size elements with page breaks
    let slideInfo = null;
    if (opts.slideSelector) {
      // User specified the selector — measure those elements
      slideInfo = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        if (elements.length === 0) return null;
        const first = elements[0].getBoundingClientRect();
        return { count: elements.length, width: first.width, height: first.height };
      }, opts.slideSelector);
    } else {
      // Auto-detect
      slideInfo = await autoDetectSlides(page);
    }

    let pdfOptions;

    if (slideInfo) {
      // Slide mode: inject @page CSS to match slide dimensions exactly,
      // strip body background/margins, and let each slide fill the page.
      const widthIn = (slideInfo.width / 96).toFixed(4);
      const heightIn = (slideInfo.height / 96).toFixed(4);

      await page.evaluate(() => {
        document.body.style.background = 'white';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
      });

      await page.addStyleTag({
        content: `
          @page {
            size: ${widthIn}in ${heightIn}in;
            margin: 0;
          }
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        `,
      });

      pdfOptions = {
        path: opts.output,
        width: `${widthIn}in`,
        height: `${heightIn}in`,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        scale: opts.scale,
        preferCSSPageSize: false,
        printBackground: opts.printBackground,
      };
    } else {
      // Document mode: standard PDF behavior
      const margins = parseMargins(opts);

      let displayHeaderFooter = false;
      let headerTemplate = opts.header;
      let footerTemplate = opts.footer;

      if (opts.pageNumbers && !opts.footer) {
        footerTemplate = PAGE_NUMBER_FOOTER;
      }

      if (headerTemplate || footerTemplate) {
        displayHeaderFooter = true;
        if (!headerTemplate) headerTemplate = '<span></span>';
        if (!footerTemplate) footerTemplate = '<span></span>';
      }

      pdfOptions = {
        path: opts.output,
        format: opts.format,
        landscape: opts.landscape,
        margin: margins,
        scale: opts.scale,
        preferCSSPageSize: opts.preferCssPageSize,
        printBackground: opts.printBackground,
        displayHeaderFooter,
        headerTemplate,
        footerTemplate,
      };
    }

    if (opts.pageRanges) {
      pdfOptions.pageRanges = opts.pageRanges;
    }

    await page.pdf(pdfOptions);
    await browser.close();

    const stat = fs.statSync(opts.output);
    const result = {
      success: true,
      output: opts.output,
      size: stat.size,
    };
    if (slideInfo) {
      result.mode = 'slide';
      result.slides = slideInfo.count;
      result.slideSize = `${slideInfo.width}x${slideInfo.height}px`;
    }
    console.log(JSON.stringify(result));
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.log(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  }
}

main();
