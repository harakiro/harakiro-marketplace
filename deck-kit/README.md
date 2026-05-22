# Deck Kit

Branded presentation deck toolkit. Author decks as HTML, then convert to PPTX or PDF. Works in **Claude Code** and **GitHub Copilot CLI** from a single source of truth at `.claude/skills/`.

## What's inside

Three skills:

| Skill | Purpose |
|---|---|
| `deck-create` | Conversational deck authoring — produces a single self-contained `.html` file ready for conversion. |
| `deck-publish` | Converts deck HTML to PDF or PPTX (pixel-perfect screenshot mode or fully editable mode). Wraps Puppeteer + pptxgenjs. |
| `deck-brand-init` | Walks the user through creating `brand/brand.yaml` so the other two skills produce on-brand output. |

## Install — GitHub Copilot CLI

Copilot CLI auto-discovers skills in `.github/skills/`, `.claude/skills/`, `.agents/skills/`, `~/.copilot/skills/`, and `~/.agents/skills/`. The recommended install paths:

**As a plugin (recommended):**

```bash
copilot
> /plugin install <github-user>/deck-kit
```

**Manual install (for development or offline use):**

```bash
git clone https://github.com/<github-user>/deck-kit.git ~/.copilot/plugins/deck-kit
ln -s ~/.copilot/plugins/deck-kit/.claude/skills ~/.copilot/skills/deck-kit
```

**One-time setup for `deck-publish`** (the publish step needs Node.js, Puppeteer, and pptxgenjs):

```bash
cd ~/.copilot/plugins/deck-kit/.claude/skills/deck-publish
npm install
```

This downloads Puppeteer's bundled Chromium (~150–200 MB) on first install. Subsequent installs are cached.

### Verify

```bash
copilot
> /deck-brand-init           # walks through brand.yaml setup
> /deck-create "test deck about widgets"
> /deck-publish output.html  # produces .pptx by default; add --to pdf for PDF
```

## Install — Claude Code

Claude Code reads skills from `.claude/skills/` (project-scoped) and `~/.claude/skills/` (personal). Same source tree — no duplication.

**As a plugin (recommended):**

```
claude
> /plugin install <github-user>/deck-kit
```

**Manual install:**

```bash
git clone https://github.com/<github-user>/deck-kit.git ~/.claude/plugins/deck-kit
ln -s ~/.claude/plugins/deck-kit/.claude/skills/deck-create ~/.claude/skills/deck-create
ln -s ~/.claude/plugins/deck-kit/.claude/skills/deck-publish ~/.claude/skills/deck-publish
ln -s ~/.claude/plugins/deck-kit/.claude/skills/deck-brand-init ~/.claude/skills/deck-brand-init
```

Run the same `npm install` step inside `deck-publish/` before the first publish.

### Verify

```
claude
> /deck-brand-init
> /deck-create "test deck about widgets"
> /deck-publish output.html
```

## Requirements

- **Node.js 18+** (for `deck-publish`)
- **~200 MB** disk for Puppeteer's bundled Chromium
- Optional: a system Chrome at `/usr/bin/google-chrome-stable` for slightly faster cold starts

## Source layout

```
deck-kit/
├── .claude-plugin/
│   └── plugin.json            # Plugin manifest (read by both Claude Code and Copilot CLI)
└── .claude/skills/
    ├── deck-create/           # SKILL.md + references/
    ├── deck-publish/          # SKILL.md + scripts/ + references/ + package.json
    └── deck-brand-init/       # SKILL.md + references/
```

`.claude/skills/` is the only repo-root path read by **both** Claude Code and Copilot CLI, so no symlinks or build step are needed.

## License

MIT — see plugin manifest.
