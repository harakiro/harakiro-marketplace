---
name: deck-brand-init
description: "Set up brand guidelines for deck creation — creates brand/brand.yaml with identity, colors, typography, layout, logo, and footer config. Use this skill when the user wants to initialize brand defaults for their project so /deck-create and /deck-publish --editable produce on-brand output. Also trigger on 'set up brand', 'configure brand', 'create brand.yaml', 'brand init', or when the user starts deck work in a project with no existing brand.yaml."
---

# deck-brand-init

Set up a `brand/brand.yaml` file in the current project so `/deck-create` and `/deck-publish --editable` produce on-brand output.

## Behavior

When invoked, do the following:

### 1. Read the brand schema

Read the full schema from this skill's references:

```
references/brand-schema.md
```

(Identical copies also ship inside the `deck-create` and `deck-publish` skill bundles — any of the three is fine.)

This defines every field the brand file can hold.

### 2. Check for existing brand config

Search the current working directory for existing brand files:
- `brand/brand.yaml`
- `brand/brand.yml`
- `brand/brand.json`
- `brand.yaml` in the project root

If a brand file exists, read it and report what's already defined and what's missing. Offer to fill gaps.

### 3. Gather brand information

Walk the user through what's needed, starting with the essentials. Be conversational — don't ask all questions at once. If the user gives short answers, fill in sensible defaults and confirm.

**Required (ask first):**
- Company/brand name → `identity.company`
- Primary color (hex — help them pick if unsure) → `colors.primary`
- Font preference (suggest Google Fonts options if they're not sure) → `typography.heading_font` + `body_font` + `google_fonts_url`

**Recommended (ask after the basics):**
- Secondary/accent color → `colors.secondary`
- Tagline or descriptor → `identity.tagline`
- Voice/tone description → `identity.voice`
- Logo file (PNG or SVG) → `logo.path`

**Optional (mention but don't push):**
- Slide layout preferences → `layout.*` (free-form prose)
- Footer text (for editable PPTX) → `footer.left/center/right`
- Document metadata → `metadata.author`

### 4. Create brand directory

Create `brand/brand.yaml` with the user's answers, omitting sections they didn't provide. Example output for a minimal setup:

```yaml
identity:
  company: "Acme Corp"
  tagline: "Building the future, today"
  voice: "Professional but approachable"

colors:
  primary: "#006554"
  secondary: "#00875a"
  background: "#ffffff"
  text: "#1a1a1a"
  muted: "#888888"

typography:
  heading_font: "Inter, sans-serif"
  body_font: "Inter, sans-serif"
  google_fonts_url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"

logo:
  path: "./logo.png"
  placement: "top-right"
  width_in: 0.8
  skip_on_cover: true

footer:
  left: "Acme Corp"
  center: "Confidential"
  right: "Page {page} of {total}"
```

Also create the directory structure:

```
brand/
├── brand.yaml        ← filled in config
├── logo.png / .svg   ← if provided
└── assets/           ← optional
```

If the user provided a logo path that doesn't exist yet, create a placeholder note suggesting they drop it in manually.

### 5. Confirm and suggest next steps

Show a short summary of what was created and suggest:

> "Brand config is set up at `brand/brand.yaml`. You're ready to create a deck — just say `/deck-create [topic]`. When you publish with `/deck-publish --editable`, the footer and logo will be applied automatically."

## Schema reference

The full field-by-field schema is in `references/brand-schema.md`. Read it for field meanings, placeholder support (`{page}`, `{total}`, `{date}` in footer fields), color format rules, and parser limitations.
