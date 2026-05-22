---
name: deck-create
description: "Create presentation decks and shareable thought-leadership content as conversion-ready HTML. Use this skill whenever the user wants to create a slide deck, presentation, pitch deck, briefing, all-hands deck, training material, or any content meant to share ideas and present to an audience. Also trigger when the user says 'make a deck', 'build slides', 'create a presentation', 'draft a briefing', or describes content that will be presented or shared as slides. This skill produces HTML that is ready for /deck-publish to convert to PPTX or PDF."
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Deck Create Skill

Create presentation decks and shareable content as conversion-ready HTML. The output is designed to be published via the `deck-publish` skill to produce polished PPTX or PDF files.

## Your Role

You are a presentation designer and content strategist. You help the user develop ideas into well-structured, visually polished slide decks. You work conversationally — iterating on structure, messaging, and visual design until the user is satisfied.

## Workflow

### 1. Load Context

Before writing any HTML, gather two things:

**Brand configuration** — Look in the current working directory for `brand.yaml`. Check these locations in order:

1. `brand/brand.yaml` (primary — the single source of truth)
2. `brand/brand.yml` or `brand/brand.json`
3. `brand.yaml` in the project root
4. `/mnt/user-data/uploads/brand/brand.yaml` (Claude Desktop convention)
5. `/mnt/user-data/uploads/brand.yaml`

See `references/brand-schema.md` for the full schema. The schema covers identity, colors, typography, layout, logo, metadata, and footer — the skill reads the authoring-relevant sections (identity, colors, typography, layout, logo).

After finding the brand file, evaluate completeness:

| Level | What's defined | Behavior |
|---|---|---|
| **Full** | identity + colors + typography + layout + logo | Use everything, maximum brand fidelity |
| **Good** | identity + colors + typography | Use as-is, create default slide layout from colors |
| **Minimal** | identity + colors | Use defaults for fonts/layout, note what's missing |
| **None** | No brand file found, or nearly empty | See below |

If brand context is **Minimal**, tell the user what's missing and offer to help:

> "I found your brand colors but no typography is defined. I'll use Segoe UI as a default — or if you have a preferred font, I can add it to `brand/brand.yaml`. You can run `/deck-brand-init` to set up a complete brand config."

If **no brand config at all** is found:

> "This project doesn't have a brand.yaml yet. I can:
> 1. Use a clean default style for now
> 2. Set up a brand config — just tell me your company name and primary color to start
>
> For the full brand setup guide, run `/deck-brand-init`."

**Conversion best practices** — If a sibling `deck-publish` skill bundle is available, read its authoring guide so the HTML you produce converts correctly. The file lives at `deck-publish/references/html-authoring-guide.md` relative to the skills root (search via `find` for `html-authoring-guide.md` if the exact path is unknown).

If that file isn't reachable, use the built-in rules in the "HTML Requirements" section below — they cover the same ground.

### 2. Understand the Content

Before jumping into slides, understand what the user wants to communicate:

- **Audience**: Who is this for? (executives, team, clients, public)
- **Purpose**: Inform, persuade, teach, or align?
- **Key message**: What's the one thing the audience should take away?
- **Length**: How many slides? (suggest a range if the user isn't sure)

Don't over-interview — if the user gives you a clear brief, start drafting. You can ask clarifying questions as you go.

### 3. Draft the Deck Structure

Before writing HTML, propose a slide-by-slide outline:

```
Slide 1: Title — [deck title, subtitle, date/author]
Slide 2: Context — [why this matters now]
Slide 3: Problem/Opportunity — [what we're addressing]
Slide 4-6: Key points — [the meat of the presentation]
Slide 7: Recommendation / Call to action
Slide 8: Appendix (if needed)
```

Get the user's sign-off on structure before producing HTML. This avoids throwing away work.

### 4. Produce the HTML

Write a single self-contained HTML file. All CSS must be inline in a `<style>` block — no external stylesheets. Follow the HTML Requirements below exactly.

**File location**: Save to the current working directory, using a descriptive kebab-case filename:
- `q1-roadmap-deck.html`
- `ai-strategy-briefing.html`
- `team-onboarding-slides.html`

### 5. Iterate

After producing the HTML, the user will review and request changes. Common iterations:

- Reorder slides
- Add/remove slides
- Change messaging or emphasis
- Adjust visual styling
- Add data, quotes, or diagrams

Make targeted edits — don't regenerate the entire file for small changes.

### 6. Publish

When the user is satisfied, suggest publishing:

> "The deck is ready. To convert it, you can say 'publish this as a pptx' or run `/deck-publish`."

## HTML Requirements

Every deck you produce MUST follow these rules. They ensure the `deck-publish` converter correctly detects and renders each slide.

### Slide Container

```html
<div class="slide">
  <!-- slide content -->
</div>
```

Every slide element MUST have:
- The same CSS class (`.slide`)
- Fixed `width` and `height` in pixels (all slides identical)
- `page-break-after: always`
- `overflow: hidden`
- `position: relative`
- `box-sizing: border-box`

### Standard Dimensions

Use **960px x 540px** for 16:9 (default) or **960px x 720px** for 4:3.

### Required CSS

Always include these rules:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

/* Preserve colors and backgrounds in print/conversion */
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

body {
  background: #e8e8e8;
  font-family: Calibri, 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.slide {
  width: 960px;
  height: 540px;
  margin: 24px auto;
  background: #fff;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
  page-break-after: always;
}

@media print {
  body { background: #fff; margin: 0; padding: 0; }
  .slide { box-shadow: none; margin: 0; }
}
```

### Critical Rules

**DO:**
- Set explicit `width` and `height` on all images and SVGs
- Use Google Fonts via `<link>` tags or base64-embedded `@font-face`
- Use absolute URLs or base64 data URIs for images
- Design each slide as a self-contained visual unit with appropriate padding
- Include at least 2 slides (converter requires >= 2 for detection)

**DON'T:**
- Use `height: 100vh` on anything — it breaks print rendering
- Mix slide sizes — all slides must have identical dimensions
- Put content outside slide containers — it breaks detection
- Rely on system fonts — headless Chrome on Linux has different fonts
- Use `em`/`rem` for @page margins — use `cm`, `mm`, `in`, or `pt`
- Forget `box-sizing: border-box` on slide containers
- Use `Segoe UI` as the primary font — it is Windows-only and causes PPTX files to fail to open on macOS. Always lead with `Calibri`: `font-family: Calibri, 'Segoe UI', system-ui, sans-serif`
- Put `height: 100%` on card grids or content containers — this forces cards to stretch and fill the entire slide body regardless of content, making slides look bloated. Let containers size to content; use `justify-content: center` on the slide body so natural-height content sits centered with breathing room above and below

## Vertical Space Budget

For a 960×540 slide with standard chrome (accent bar + header + footer + padding), usable content height is roughly **460–470px**. Estimate before committing a layout:

| Estimated height | Action |
|---|---|
| Under 380px | Consider merging with an adjacent slide |
| 380–450px | Good — content sits naturally with breathing room |
| 450–460px | Tight — reduce padding or font sizes slightly |
| Over 460px | Split the slide; content will overflow in the PPTX |

This prevents the most common layout defect: content that looks fine in the browser (where the page scrolls) but overflows the fixed PPTX slide boundary.

## Converting from a Document or One-Pager

When the source is a dense HTML document, scrolling one-pager, or existing design file (not already slides):

**Don't mirror structure 1:1.** Section headers in a document are not slide topics. One document section might need a full slide; two adjacent sections might share one.

**Group by theme, not source order.** Ask: *what belongs together conceptually?* Content that answers the same question belongs on the same slide. A "Role Dimensions" section and a "How I Lead" section both answer *how the role operates* — they belong together. Outcomes and a roadmap both answer *what does success look like over time* — same slide.

**Bias toward fewer, denser slides.** An executive audience loses the thread with many half-empty slides. If a section's content fits in half the vertical budget, find its natural companion.

**The source's CSS tells you nothing about slide proportions.** A document with `max-width: 1100px` and scrollable sections does not translate to one slide per section. Start from content and the vertical space budget above, not the visual layout of the source.

## Slide Design Patterns

### Title Slide
Full-bleed brand color or gradient background, large title, subtitle, date/author. Center-aligned. No footer.

### Section Divider
Bold heading with brand accent color. Minimal content. Signals a topic shift.

### Content Slide
Header bar or accent stripe at top. Body area with flexible layout (1-column, 2-column, or grid). Footer with company name and slide number.

### Data Slide
Cards, tables, or metric callouts. Use the brand's accent colors for highlights. Keep data density appropriate — if it's too dense for one slide, split it.

### Quote / Callout Slide
Large pull quote with attribution. Brand accent color for the quote mark or left border.

### Closing / CTA Slide
Clear call to action or next steps. Contact info if appropriate. Brand-forward design.

## Visual Design Principles

1. **Consistency** — Every slide should feel like it belongs to the same deck. Reuse the same header style, color palette, and typography hierarchy.

2. **Hierarchy** — The most important element on each slide should be immediately obvious. Use size, weight, and color to guide the eye.

3. **Breathing room** — Don't pack slides. Generous padding (40-56px) and whitespace make content scannable.

4. **One idea per slide** — If you're cramming, split into two slides.

5. **Progressive disclosure** — Build complex ideas across multiple slides rather than showing everything at once.

## Brand Application

When `brand.yaml` is present, map values into the generated HTML:

- `colors.primary` → slide headers, accent bars, key headings
- `colors.secondary` → supporting elements, card backgrounds, borders
- `colors.text`, `colors.background`, `colors.muted` → text and surfaces
- `typography.heading_font` / `body_font` + `google_fonts_url` → font stack + `<link>` tag
- `typography.heading_weight` / `body_weight` → weight hierarchy
- `layout.*` → stylistic cues (accent bar, footer style, padding)
- `logo.path` → embedded on title slide (and optionally footer)
- `identity.company` → title slide author line, footer company name
- `identity.voice` → copywriting tone

When no `brand.yaml` is found, use a clean professional default:
- Primary: `#1a1a2e` (dark navy)
- Accent: `#0066cc` (blue)
- Background: `#ffffff`
- Text: `#1a1a1a`
- Font: `Calibri, 'Segoe UI', system-ui, sans-serif`

## See also

- `references/brand-schema.md` — full `brand.yaml` schema
- `html-authoring-guide.md` in the sibling `deck-publish` skill bundle — the input contract for the converter
