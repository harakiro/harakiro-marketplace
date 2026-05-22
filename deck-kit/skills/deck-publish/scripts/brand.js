/**
 * brand.js — Load and apply a brand.yaml / brand.json config file.
 *
 * The brand config is optional. Users can place a `brand.yaml`, `brand.yml`,
 * or `brand.json` file either:
 *   - next to their HTML deck, OR
 *   - in /mnt/user-data/uploads/ (Claude Desktop surface), OR
 *   - at an explicit path via --brand <path>
 *
 * Everything in the config is optional. Present fields are applied after
 * the HTML has been extracted and as the pptx is built.
 *
 * Schema (all optional):
 *
 *   metadata:
 *     author: "..."
 *     company: "..."
 *     title: "..."
 *
 *   footer:
 *     left: "..."            # Text for bottom-left of every slide
 *     center: "..."          # Bottom-center
 *     right: "..."           # Bottom-right. Supports {page}, {total}, {date}.
 *     color: "333333"        # Optional. Auto dark/light on slide bg if absent.
 *     font_size: 9           # pt. Optional; default 9.
 *     skip_if_html_has_footer: true     # default true
 *
 *   logo:
 *     path: "./brand/logo.png"    # relative to brand.yaml
 *     placement: "top-right"      # top-left, top-right, bottom-left, bottom-right
 *     margin_in: 0.3              # default 0.3
 *     width_in: 0.8               # default 0.8, height preserves aspect
 *     skip_on_cover: false        # default false
 */

const fs = require("fs");
const path = require("path");

/**
 * Minimal YAML parser for the brand schema.
 *
 * Handles: nested mappings (2-level), string / number / boolean scalars,
 * quoted and unquoted strings, # comments, blank lines.
 *
 * Does NOT handle: arrays, multi-line strings, anchors, tags, flow syntax,
 * deeply nested structures. The brand schema doesn't need any of that.
 *
 * For anything more ambitious, the user can write brand.json instead.
 */
function parseSimpleYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  let currentKey = null;
  let currentObj = null;

  for (let rawLine of lines) {
    // Strip comments (only if # is not inside quotes). Simple heuristic:
    // a # with whitespace before it is always a comment start.
    const hashIdx = rawLine.indexOf("#");
    if (hashIdx >= 0) {
      // Check if the # is inside a quoted string
      const before = rawLine.slice(0, hashIdx);
      const dq = (before.match(/"/g) || []).length;
      const sq = (before.match(/'/g) || []).length;
      if (dq % 2 === 0 && sq % 2 === 0) {
        rawLine = before;
      }
    }
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    const colonIdx = content.indexOf(":");
    if (colonIdx < 0) {
      throw new Error(`brand.yaml: missing ':' on line: ${line}`);
    }
    const key = content.slice(0, colonIdx).trim();
    const rawValue = content.slice(colonIdx + 1).trim();

    if (indent === 0) {
      // Top-level key
      if (rawValue === "") {
        // Section header
        currentKey = key;
        currentObj = {};
        root[currentKey] = currentObj;
      } else {
        root[key] = parseScalar(rawValue);
        currentKey = null;
        currentObj = null;
      }
    } else {
      // Nested key — must belong to a previously opened section
      if (!currentObj) {
        throw new Error(
          `brand.yaml: indented line without a parent section: ${line}`
        );
      }
      currentObj[key] = parseScalar(rawValue);
    }
  }

  return root;
}

function parseScalar(raw) {
  if (raw === "") return "";
  // Quoted strings
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  // Booleans
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "~") return null;
  // Numbers
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d*\.\d+$/.test(raw)) return parseFloat(raw);
  // Everything else is a bare string
  return raw;
}

/**
 * Find a brand config near the given HTML file. Returns a resolved path
 * or null.
 *
 * Search order:
 *   1. brand/brand.yaml (brand/brand.yml, brand/brand.json) in HTML dir
 *   2. brand.yaml (brand.yml, brand.json) in HTML dir
 *   3. Same pair, in /mnt/user-data/uploads/ (Claude Desktop convention)
 *   4. brand/brand.yaml in parent directory (one level up, for nested layouts)
 */
function discoverBrandFile(htmlPath) {
  const htmlDir = path.dirname(path.resolve(htmlPath));
  const parentDir = path.dirname(htmlDir);

  const searchPaths = [
    path.join(htmlDir, "brand"),
    htmlDir,
    "/mnt/user-data/uploads/brand",
    "/mnt/user-data/uploads",
    path.join(parentDir, "brand"),
  ];
  const candidates = ["brand.yaml", "brand.yml", "brand.json"];
  for (const dir of searchPaths) {
    for (const name of candidates) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Load and validate a brand file. Returns a normalized config object
 * (with defaults filled in for omitted fields) or null on failure.
 */
function loadBrand(brandPath) {
  if (!brandPath) return null;
  const absPath = path.resolve(brandPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Brand file not found: ${absPath}`);
  }
  const text = fs.readFileSync(absPath, "utf8");
  const ext = path.extname(absPath).toLowerCase();
  let raw;
  if (ext === ".json") {
    raw = JSON.parse(text);
  } else {
    raw = parseSimpleYaml(text);
  }
  return normalizeBrand(raw, path.dirname(absPath));
}

function normalizeBrand(raw, brandDir) {
  const b = {};

  // --- Authoring-side sections (read by deck-create) ---

  if (raw.identity) {
    b.identity = {
      company: raw.identity.company || null,
      tagline: raw.identity.tagline || null,
      voice: raw.identity.voice || null,
    };
  }

  if (raw.colors) {
    b.colors = {};
    for (const [key, val] of Object.entries(raw.colors)) {
      if (typeof val === "string") b.colors[key] = normalizeHex(val);
    }
  }

  if (raw.typography) {
    b.typography = {
      heading_font: raw.typography.heading_font || null,
      body_font: raw.typography.body_font || null,
      heading_weight: raw.typography.heading_weight || null,
      body_weight: raw.typography.body_weight || null,
      google_fonts_url: raw.typography.google_fonts_url || null,
    };
  }

  if (raw.layout) {
    // Layout is advisory prose for the authoring skill — pass through as-is
    b.layout = { ...raw.layout };
  }

  // --- Shared: logo ---
  // One logo field used by both sides. deck-create uses it on title slides;
  // deck-publish places it as a corner overlay based on placement config.
  if (raw.logo && raw.logo.path) {
    const logoPath = path.isAbsolute(raw.logo.path)
      ? raw.logo.path
      : path.resolve(brandDir, raw.logo.path);
    if (!fs.existsSync(logoPath)) {
      console.error(
        `brand.yaml warning: logo file not found at ${logoPath} — logo will be skipped`
      );
    } else {
      b.logo = {
        path: logoPath,
        placement: raw.logo.placement || "top-right",
        margin_in: raw.logo.margin_in || 0.3,
        width_in: raw.logo.width_in || 0.8,
        skip_on_cover: !!raw.logo.skip_on_cover,
      };
    }
  }

  // --- Publishing-side sections (read by deck-publish --editable) ---

  if (raw.metadata) {
    b.metadata = {
      author: raw.metadata.author || null,
      // Fall back to identity.company if metadata.company omitted
      company: raw.metadata.company || (raw.identity && raw.identity.company) || null,
      title: raw.metadata.title || null,
    };
  } else if (raw.identity) {
    // If no explicit metadata section, derive minimal metadata from identity
    b.metadata = {
      author: null,
      company: raw.identity.company || null,
      title: null,
    };
  }

  if (raw.footer) {
    b.footer = {
      left: raw.footer.left || "",
      center: raw.footer.center || "",
      right: raw.footer.right || "",
      color: raw.footer.color ? normalizeHex(raw.footer.color) : null,
      font_size: raw.footer.font_size || 9,
      skip_if_html_has_footer:
        raw.footer.skip_if_html_has_footer !== undefined
          ? raw.footer.skip_if_html_has_footer
          : true,
    };
  }

  return b;
}

/**
 * Normalize a hex color string to a bare 6-char uppercase form
 * (e.g. "#006554" → "006554", "006554" → "006554", "#06F" → "0066FF").
 * pptxgenjs requires bare hex; we accept either input form.
 */
function normalizeHex(input) {
  if (typeof input !== "string") return input;
  let s = input.trim().replace(/^#/, "").toUpperCase();
  // Expand 3-char shorthand to 6
  if (/^[0-9A-F]{3}$/.test(s)) {
    s = s.split("").map((c) => c + c).join("");
  }
  if (/^[0-9A-F]{6}$/.test(s)) return s;
  // Not a recognizable hex color — return unchanged (may be a CSS keyword etc.)
  return input;
}

/**
 * Decide whether a slide likely already has its own footer based on
 * extracted layers. Heuristic: any text layer whose bbox falls within
 * the bottom ~8% of the slide.
 */
function slideHasExistingFooter(slideData, slideHeightPx) {
  const bottomBand = slideHeightPx * 0.92;
  for (const L of slideData.layers || []) {
    if (L.type !== "text") continue;
    const bbox = L.bbox || {};
    if (bbox.y + bbox.h * 0.5 >= bottomBand) return true;
  }
  return false;
}

/**
 * Pick a readable footer text color for a given slide background.
 * Logic: if slide has a gradient background (root or full-bleed inner
 * layer) → white; else use relative luminance of backgroundColor to pick
 * black-ish or white-ish.
 */
function pickFooterColor(slideData) {
  // Root-level gradient (screenshot attached as slide background)
  if (slideData.backgroundHasGradient) return "FFFFFF";
  if (slideData.backgroundImageDataUrl) return "FFFFFF";

  // Full-bleed gradient on an inner layer (common pattern: .slide has
  // white background, but .slide-inner.cover-bg has the gradient)
  const sW = slideData.widthPx || 960;
  const sH = slideData.heightPx || 540;
  const slideArea = sW * sH;
  for (const L of slideData.layers || []) {
    if (L.type !== "shape") continue;
    if (!L.hasGradient) continue;
    const bb = L.bbox || {};
    const coverage = (bb.w * bb.h) / slideArea;
    if (coverage >= 0.9) return "FFFFFF";
  }

  const bg = slideData.backgroundColor || "FFFFFF";
  // Parse hex and compute relative luminance
  const r = parseInt(bg.slice(0, 2), 16) / 255;
  const g = parseInt(bg.slice(2, 4), 16) / 255;
  const b = parseInt(bg.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.5 ? "FFFFFF" : "333333";
}

/**
 * Interpolate {page}, {total}, {date} in a footer text template.
 */
function interpolateFooter(template, pageIdx, totalPages) {
  if (!template) return "";
  const today = new Date().toISOString().slice(0, 10);
  return template
    .replace(/\{page\}/g, String(pageIdx))
    .replace(/\{total\}/g, String(totalPages))
    .replace(/\{date\}/g, today);
}

module.exports = {
  discoverBrandFile,
  loadBrand,
  slideHasExistingFooter,
  pickFooterColor,
  interpolateFooter,
};
