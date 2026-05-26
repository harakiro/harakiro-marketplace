# Harakiro Plugins

A plugin marketplace for **Claude Code** and **GitHub Copilot CLI**.

## Installation

```bash
# Add the marketplace
/plugin marketplace add harakiro/harakiro-marketplace

# Install plugins
/plugin install ralph@harakiro-marketplace
/plugin install deck-kit@harakiro-marketplace
```

The same commands work in both `claude` and `copilot`.

## Available Plugins

| Plugin | Description | Models |
|--------|-------------|--------|
| [ralph](./ralph) | Automated AI development loop | Opus, Sonnet, Haiku |
| [deck-kit](./deck-kit) | Branded HTML → PPTX/PDF presentation toolkit | Session |

---

## Ralph Agent

Automates feature development through Task agents. Plan with Opus, build with Sonnet, iterate until done.

### Commands

| Command | Model | Description |
|---------|-------|-------------|
| `/ralph:ralph-init` | Opus | Initialize project structure |
| `/ralph:ralph-onboard` | Opus | Analyze existing codebase |
| `/ralph:ralph-plan` | Opus | Create roadmap and task breakdown |
| `/ralph:ralph-loop` | Sonnet | Automated feature builder (Task agents) |
| `/ralph:ralph-build` | Session | Manual task implementation |
| `/ralph:ralph-review` | Opus | Process feedback into fix tasks |
| `/ralph:ralph-feedback` | Session | Parse raw feedback |
| `/ralph:ralph-status` | Haiku | Display progress |
| `/ralph:ralph-cancel` | Haiku | Cancel active loop |

### Workflow

```
/ralph:ralph-init          # Set up project
/ralph:ralph-onboard       # (existing codebase) or create PRD.md
/ralph:ralph-plan          # Create roadmap + tasks
/ralph:ralph-loop          # Build entire feature automatically
# Test manually...
/ralph:ralph-feedback      # Capture issues
/ralph:ralph-review        # Create fix tasks
/ralph:ralph-loop          # Implement fixes
/ralph:ralph-plan          # Next feature
```

See [ralph/README.md](./ralph/README.md) for detailed documentation.

---

## Deck Kit

Author presentation decks as a single self-contained HTML file, then publish to PowerPoint or PDF. Brand-aware: a `brand/brand.yaml` drives colors, type, layout, logo, and footers so every deck comes out on-brand. Works identically in Claude Code and Copilot CLI from one source tree.

### Skills

| Skill | Purpose |
|---|---|
| `/deck-brand-init` | Scaffold `brand/brand.yaml` (identity, colors, typography, layout, logo, footer). |
| `/deck-create` | Conversational deck authoring — produces a self-contained `.html` ready to publish. |
| `/deck-publish` | Convert deck HTML to PDF or PPTX. |

### Publish modes

| Mode | Flag | Output |
|---|---|---|
| Screenshot PPTX | _(default)_ | Pixel-perfect — each slide is a rendered image. Highest visual fidelity. |
| Editable PPTX | `--editable` | Real PowerPoint text boxes, shapes, and tables you can edit natively. |
| PDF | `--to pdf` | Flat PDF for distribution and archiving. |

The editable converter extracts text, gradients, and SVG/icon layers into native PPTX elements and post-processes the OOXML so the file opens clean in PowerPoint (no "needs repair" dialog).

### Workflow

```
/deck-brand-init                       # one-time, per project
/deck-create "Q3 strategy all-hands"   # author the HTML
/deck-publish deck.html                # screenshot PPTX (default)
/deck-publish deck.html --editable     # editable PPTX
/deck-publish deck.html --to pdf       # PDF
```

**Dependencies self-install.** On the first publish, `deck-publish` detects missing native deps (Puppeteer + pptxgenjs) and runs `npm install` automatically — a one-time ~30–60s wait plus a ~150–200 MB Chromium download. Subsequent runs are instant.

See [deck-kit/README.md](./deck-kit/README.md) for install paths, manual dependency setup, and the source layout.

---

## Adding New Plugins

To add a plugin to this marketplace:

1. Create a new directory: `my-plugin/`
2. Add `.claude-plugin/plugin.json`:
   ```json
   {
     "name": "my-plugin",
     "description": "What it does",
     "version": "1.0.0"
   }
   ```
3. Add commands in `my-plugin/commands/*.md`
4. Register in `.claude-plugin/marketplace.json`

## License

MIT
