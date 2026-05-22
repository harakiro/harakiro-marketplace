# Brand Schema

The `brand.yaml` file is the single source of truth for a project's visual identity. Both `deck-create` (authoring) and `deck-publish --editable` (publishing) read it.

## File location

```
my-project/
├── brand/
│   ├── brand.yaml      ← primary config
│   ├── logo.png        ← referenced from brand.yaml (or .svg)
│   └── assets/         ← optional supporting files
├── deck.html
└── ...
```

Both skills auto-discover the file in this order:

1. `--brand <path>` (explicit override, deck-publish only)
2. `./brand/brand.yaml` (or `.yml` / `.json`) — the standard location
3. `./brand.yaml` — if you'd rather not nest
4. `/mnt/user-data/uploads/brand/` (Claude Desktop convention)
5. `/mnt/user-data/uploads/`

## Complete schema

Every section is optional. An empty file is valid — the skills fall back to sensible defaults. Here's the complete shape with every field:

```yaml
# ---------------------------------------------------------------
# Who the brand is. Used by deck-create for voice/tone and by
# deck-publish as a fallback when metadata.company is omitted.
# ---------------------------------------------------------------
identity:
  company: "Acme Corp"
  tagline: "Building the future, today"
  voice: "Professional but approachable, confident not arrogant"

# ---------------------------------------------------------------
# Color palette. Keys are free-form — use whatever semantic names
# make sense for your brand. Values are hex colors (with or
# without leading #; both accepted, stored normalized).
#
# Conventions the skills look for when present:
#   primary, secondary, background, text, muted,
#   text_on_primary, card_background, accent_card
#
# Other keys are passed through as-is for custom use.
# ---------------------------------------------------------------
colors:
  primary: "#006554"
  secondary: "#00875a"
  background: "#ffffff"
  text: "#1a1a1a"
  text_on_primary: "#ffffff"
  muted: "#888888"
  card_background: "#f5f5f5"
  accent_card: "#e8f5f0"

# ---------------------------------------------------------------
# Typography. Used by deck-create to set font stacks in the
# generated HTML. deck-publish doesn't use this — it reads fonts
# from the rendered HTML at conversion time.
# ---------------------------------------------------------------
typography:
  heading_font: "Inter, sans-serif"
  body_font: "Inter, sans-serif"
  heading_weight: 800
  body_weight: 400
  # Required when using non-default fonts — headless Chrome
  # cannot access locally-installed fonts during conversion.
  google_fonts_url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"

# ---------------------------------------------------------------
# Layout hints. Free-form prose read by deck-create to shape the
# look of generated slides. deck-publish ignores this section.
# ---------------------------------------------------------------
layout:
  accent_bar: "6px gradient bar at top of each slide (primary → secondary)"
  footer_style: "primary color background, white text"
  content_padding: "44px top, 56px sides, 40px bottom"
  aspect_ratio: "16:9"

# ---------------------------------------------------------------
# Logo file. One field shared by both skills: deck-create may
# embed it on title slides; deck-publish --editable places it
# as a corner overlay on each slide.
#
# Relative paths resolve relative to the brand.yaml file.
# ---------------------------------------------------------------
logo:
  path: "./logo.png"           # or .svg — any Chrome-supported image format
  placement: "top-right"       # top-left, top-right, bottom-left, bottom-right
  margin_in: 0.3               # distance from slide edge, in inches
  width_in: 0.8                # logo width, in inches (height preserves aspect)
  skip_on_cover: true          # if true, skip the first slide (usually a cover)

# ---------------------------------------------------------------
# Document properties written into the PPTX's core metadata
# (visible in PowerPoint's File → Info panel).
# metadata.company falls back to identity.company if omitted.
# ---------------------------------------------------------------
metadata:
  author: "Acme Technology Team"
  company: "Acme Corp"         # optional — falls back to identity.company
  title: "Q1 Strategy Deck"    # optional — overrides default

# ---------------------------------------------------------------
# Per-slide footer overlay (only used by deck-publish --editable).
# Three positions; any or all can be omitted. Supports
# placeholders: {page}, {total}, {date}.
# ---------------------------------------------------------------
footer:
  left: "Acme Corp — Technology"
  center: "Confidential"
  right: "Page {page} of {total}"

  # Explicit footer text color. If omitted, auto-switches between
  # dark gray and white based on each slide's background.
  color: null                  # e.g. "#333333" or null for auto

  font_size: 9                 # points

  # If true (default), suppresses the brand footer on any slide
  # that already has a footer-like element in its bottom ~8%.
  # Set to false to always draw the brand footer on every slide.
  skip_if_html_has_footer: true
```

## Minimal example

The shortest valid brand.yaml:

```yaml
identity:
  company: "Acme Corp"

colors:
  primary: "#006554"
```

With just those two fields:
- `deck-create` uses "Acme Corp" for title slides and "#006554" as the primary accent color (headers, accent bars).
- `deck-publish --editable` uses "Acme Corp" in the PPTX's document metadata.

Everything else falls back to defaults.

## Hex colors

Both `#006554` and `006554` are accepted. The `#` prefix is recommended for readability — it's the standard CSS/web format. Internally the skills normalize to bare uppercase hex for PowerPoint compatibility.

3-character shorthand also works: `#06f` expands to `#0066ff`.

## Placeholder substitution

Only the three `footer` text fields support placeholders. They're replaced when the PPTX is built:

- `{page}` → current slide number (1-indexed)
- `{total}` → total slide count
- `{date}` → today's date in ISO format (`YYYY-MM-DD`)

Examples:
```yaml
footer:
  right: "{page}"                 # "1", "2", "3", ...
  right: "{page} / {total}"       # "1 / 30"
  right: "Page {page} of {total}"
  center: "{date} · Confidential"
```

## JSON alternative

If you prefer JSON or need to generate the file programmatically, save as `brand.json` with the same structure. The skills accept `.yaml`, `.yml`, or `.json`.

## Parser limits

The skills ship with a small built-in YAML parser (no external dependency). It supports:

- Two-level nesting (top-level sections + one level of fields)
- String scalars (quoted or bare), numbers, booleans (`true`/`false`), `null` / `~`
- `#` comments
- Blank lines

It does NOT support:

- Arrays (use JSON if you need arrays)
- Multi-line strings (`|`, `>`)
- YAML anchors and references
- Flow syntax (`{...}`, `[...]` inline)
- Nesting deeper than 2 levels

Quote any string containing `:`, `#`, or starting with whitespace to be safe. URLs in `google_fonts_url` work unquoted because the parser splits on the first `:`, but quoting is still a good habit.

## How each skill uses the schema

**`deck-create`** reads these sections when authoring HTML:
- `identity` — for title slide text, voice/tone
- `colors` — mapped to CSS variables in the generated HTML
- `typography` — font stacks + Google Fonts `<link>`
- `layout` — prose guidance for the slide frame
- `logo` — embedded on title slide (and possibly as footer logo, depending on style)

**`deck-publish --editable`** reads these sections when building the PPTX:
- `metadata` — written to the PPTX's core document properties
- `footer` — per-slide footer text overlay
- `logo` — placed as a corner overlay on each slide
- `identity.company` — used as a fallback for `metadata.company`

The other modes (`deck-publish` screenshot PPTX, `deck-publish --to pdf`) don't use the brand file — they render whatever the HTML looks like.

## Completeness guidance (for deck-create)

The `deck-create` skill evaluates brand completeness when it runs:

| Level | What's defined | deck-create behavior |
|---|---|---|
| **Full** | identity + colors + typography + layout + logo | Maximum brand fidelity |
| **Good** | identity + colors + typography | Creates a default slide layout from the palette |
| **Minimal** | identity + colors | Uses default fonts (Segoe UI); derives layout from colors |
| **None** | File missing or empty | Asks user for basics, or uses a clean professional default |

See each skill's SKILL.md for how unset fields are handled.
