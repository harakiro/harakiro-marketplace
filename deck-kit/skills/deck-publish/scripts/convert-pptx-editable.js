#!/usr/bin/env node

/**
 * Editable-mode PPTX converter. Runs extract.js then build.js to produce a
 * PowerPoint file where text, shapes, and tables are real editable PPT
 * elements (not screenshots).
 *
 * Usage: node convert-pptx-editable.js <input.html> [options]
 *
 * Typically invoked via `convert-pptx.js --editable`, but also usable
 * directly. Output matches the JSON shape of convert-pptx.js so callers
 * can't tell the difference at the result level.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const brandMod = require('./brand');

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    selector: null,
    brand: null,
    noBrand: false,
    useBackgroundImages: false,
    keepJson: false,
  };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') args.output = argv[++i];
    else if (a === '--selector' || a === '--slide-selector') args.selector = argv[++i];
    else if (a === '--brand') args.brand = argv[++i];
    else if (a === '--no-brand') args.noBrand = true;
    else if (a === '--use-background-images') args.useBackgroundImages = true;
    else if (a === '--keep-json') args.keepJson = true;
    else if (!a.startsWith('--')) positional.push(a);
  }
  args.input = positional[0];
  return args;
}

function main() {
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

  // Resolve brand: explicit > auto-discover > none
  let brandPath = null;
  if (!opts.noBrand) {
    if (opts.brand) {
      if (!fs.existsSync(opts.brand)) {
        console.log(JSON.stringify({ success: false, error: `Brand file not found: ${opts.brand}` }));
        process.exit(1);
      }
      brandPath = opts.brand;
    } else {
      brandPath = brandMod.discoverBrandFile(opts.input);
    }
  }

  const scriptDir = __dirname;
  const jsonPath = opts.keepJson
    ? opts.output.replace(/\.pptx$/i, '.slide_data.json')
    : path.join(os.tmpdir(), `slide_data_${process.pid}.json`);

  // Stage 1: extract
  const extractArgs = [
    path.join(scriptDir, 'extract.js'),
    opts.input,
    '--out', jsonPath,
  ];
  if (opts.selector) extractArgs.push('--selector', opts.selector);
  if (opts.useBackgroundImages) extractArgs.push('--capture-full-slide');

  const extractRes = spawnSync('node', extractArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (extractRes.status !== 0) {
    const err = extractRes.stderr ? extractRes.stderr.toString() : 'extract failed';
    console.log(JSON.stringify({ success: false, error: `extract failed: ${err.trim()}` }));
    process.exit(1);
  }

  // Stage 2: build
  const buildArgs = [
    path.join(scriptDir, 'build.js'),
    jsonPath,
    '--out', opts.output,
  ];
  if (opts.useBackgroundImages) buildArgs.push('--use-background-images');
  if (brandPath) buildArgs.push('--brand', brandPath);

  const buildRes = spawnSync('node', buildArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (buildRes.status !== 0) {
    const err = buildRes.stderr ? buildRes.stderr.toString() : 'build failed';
    console.log(JSON.stringify({ success: false, error: `build failed: ${err.trim()}` }));
    process.exit(1);
  }

  // Read slide count from the JSON before optionally deleting it
  let slideCount = null;
  let slidePx = null;
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    slideCount = (data.slides || []).length;
    slidePx = `${Math.round(data.slideWidthPx)}x${Math.round(data.slideHeightPx)}`;
  } catch (_) { /* ignore */ }

  if (!opts.keepJson) {
    try { fs.unlinkSync(jsonPath); } catch (_) {}
  }

  const stat = fs.statSync(opts.output);
  const result = {
    success: true,
    output: opts.output,
    size: stat.size,
    mode: 'editable',
    slides: slideCount,
  };
  if (slidePx) result.slidePixels = slidePx;
  if (brandPath) result.brand = brandPath;
  console.log(JSON.stringify(result));
}

main();
