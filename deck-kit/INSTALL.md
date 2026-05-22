# Installing the deck-create + deck-publish bundle

This bundle contains two skills and three slash commands that work together to let you author and publish presentation decks using Claude.

## What's in the bundle

| File | What it is | Install where |
|------|------------|---------------|
| `deck-create.skill` | Authoring skill — turns a topic into HTML | Claude Desktop / claude.ai |
| `deck-create.zip` | Same skill, plain zip | Claude Code |
| `deck-publish.skill` | Publishing skill — converts HTML to PDF or PPTX (screenshot or editable) | Claude Desktop / claude.ai |
| `deck-publish.zip` | Same skill, plain zip | Claude Code |
| `commands.zip` | The three slash commands (`/deck-create`, `/deck-brand-init`, `/deck-publish`) | Claude Code only |

## How it works

- **`deck-create`** is the authoring brain. It gathers context (brand, audience, message), discusses structure with you, and produces clean HTML slide decks that match deck-publish's input contract.
- **`deck-publish`** converts the HTML into a PDF or PPTX. Three modes: PDF, screenshot PPTX (default — pixel-perfect, not editable), editable PPTX (real text boxes, shapes, and tables).
- **The three slash commands** (`/deck-brand-init`, `/deck-create`, `/deck-publish`) are Claude Code niceties that invoke the skills with specific arguments.

## Surface differences

**Claude Desktop / claude.ai** supports skills but not slash commands. You invoke the skills by saying things in natural language: "make a deck about X", "publish this as a PPTX", etc. The skills' `description` fields are tuned to trigger on those phrasings.

**Claude Code** supports both skills *and* slash commands. You can use natural language or type `/deck-create`, `/deck-publish`, `/deck-brand-init`.

---

## Claude Desktop / claude.ai

You only need the two `.skill` files. There are no slash commands on Claude Desktop.

1. Open Claude (desktop app or claude.ai browser)
2. Settings → Capabilities → make sure **Code execution** is enabled
3. Settings → Skills → **Upload skill**
4. Upload `deck-create.skill`, then repeat for `deck-publish.skill`
5. Toggle both skills on

Test with natural language:

```
"Create a short deck about our Q1 roadmap for the engineering team"
→ triggers deck-create

"Convert this HTML to a PowerPoint"
→ triggers deck-publish (screenshot mode by default)

"Convert this HTML to an editable PowerPoint"
→ triggers deck-publish editable mode
```

**Note:** custom skills on claude.ai are per-user. Each teammate uploads their own copy.

---

## Claude Code

You want all three: both skill zips and the commands zip.

```bash
# Personal (across all projects)
mkdir -p ~/.claude/skills ~/.claude/commands
unzip deck-create.zip    -d ~/.claude/skills/
unzip deck-publish.zip   -d ~/.claude/skills/
unzip commands.zip       -d ~/.claude/
```

That last one is intentional — `commands.zip` contains a `commands/` folder, so unzipping it *into* `~/.claude/` places the `.md` files at `~/.claude/commands/deck-*.md`, which is where Claude Code looks.

Verify:

```bash
ls ~/.claude/skills/
# Expected: deck-create  deck-publish

ls ~/.claude/commands/
# Expected: deck-brand-init.md  deck-create.md  deck-publish.md
```

Start a new Claude Code session:

```
/skills
# Should list: deck-create, deck-publish

/deck-brand-init
/deck-create AI strategy briefing
/deck-publish deck.html --to pptx --editable
```

### Project-scoped install (optional)

To share with teammates via git, put everything under the repo instead of your home dir:

```bash
cd <your-repo>
mkdir -p .claude/skills .claude/commands
unzip /path/to/deck-create.zip   -d .claude/skills/
unzip /path/to/deck-publish.zip  -d .claude/skills/
unzip /path/to/commands.zip      -d .claude/
git add .claude
git commit -m "Add deck-create/publish skills and commands"
```

Project-scoped skills override personal ones when both exist.

---

## Typical workflow (both surfaces)

```
1. (Once per project) Set up brand guidelines:
     Claude Code:     /deck-brand-init
     Claude Desktop:  "Help me set up brand guidelines for my deck"
   → Creates brand/brand.md in your working directory

2. (Optional, for editable PPTX) Add a brand.yaml alongside brand.md:
   See "Branding" section below

3. Create a deck:
     Claude Code:     /deck-create Q1 roadmap for engineering
     Claude Desktop:  "Create a deck about our Q1 roadmap for engineering"
   → Produces deck.html in your working directory

4. Publish the deck:
     Claude Code:     /deck-publish deck.html --to pptx [--editable]
     Claude Desktop:  "Convert this to PowerPoint" (or "…to an editable PowerPoint")
   → Produces deck.pptx (or deck.pdf)
```

## Branding

Both skills read a single `brand.yaml` file — one source of truth for identity, colors, typography, logo, metadata, and per-slide footer. `deck-create` uses it to shape the HTML; `deck-publish --editable` uses it to generate the footer and logo overlays.

Create `brand/brand.yaml` in your working directory (or run `/deck-brand-init` to be walked through it):

```yaml
identity:
  company: "Your Org"
  tagline: "Your tagline here"
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

metadata:
  author: "Your Technology Team"

footer:
  left: "Your Org — Technology"
  center: "Confidential"
  right: "Page {page} of {total}"
```

All fields are optional — start with just `identity.company` and `colors.primary` and add more as you go. Footer text placeholders: `{page}`, `{total}`, `{date}`. Footer text color auto-switches between white and dark gray based on each slide's background.

Screenshot mode and PDF mode don't use brand.yaml — they just render whatever the HTML looks like. All branding for those flows through the deck-create authoring phase.

See `deck-create/references/brand-schema.md` (or the identical copy in `deck-publish/references/`) inside the installed skill for the full field-by-field schema.

---

## Runtime dependencies

The publishing side needs:
- **Node 18+**
- **System Chrome** (Google Chrome or Chromium)
- **Puppeteer** and **pptxgenjs** — both declared in `deck-publish/package.json` and installed into the skill directory via `npm install`

On Claude's hosted environments these are pre-installed. For local Claude Code, after unzipping the skill run `npm install` once inside the skill directory:

```bash
# macOS
brew install node
brew install --cask google-chrome
cd ~/.claude/skills/deck-publish && npm install

# Debian/Ubuntu
apt install -y nodejs google-chrome-stable
cd ~/.claude/skills/deck-publish && npm install
```

Chrome is auto-detected at the standard platform path (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS, `/usr/bin/google-chrome-stable` on Linux). If Chrome is installed somewhere else, set the `CHROME_PATH` env var before running any deck-publish command.

The authoring side (`deck-create`) has no runtime dependencies — it only writes HTML files.

---

## Replacing an earlier install

If you previously installed either skill as an older version (e.g. the standalone `html-to-pptx` skill from my earlier drafts):

**Claude Desktop:** Settings → Skills → delete the old one → upload the new `.skill`.

**Claude Code:**

```bash
rm -rf ~/.claude/skills/html-to-pptx    # old standalone skill, if any
rm -rf ~/.claude/skills/deck-create     # old deck-create, if any
rm -rf ~/.claude/skills/deck-publish    # old deck-publish, if any
# then re-install per the Claude Code section above
```

Skills and commands reload on the next new session in Claude Code; skill changes on Claude Desktop take effect immediately after upload.

---

## Uninstalling

**Claude Desktop:** Settings → Skills → find the skill → `...` → Delete.

**Claude Code:**

```bash
rm -rf ~/.claude/skills/deck-create ~/.claude/skills/deck-publish
rm ~/.claude/commands/deck-{brand-init,create,publish}.md
```

---

## Troubleshooting

**"Skills greyed out in settings"** — code execution disabled. Enable it in Settings → Capabilities.

**"Uploaded the .skill file but nothing happens"** — make sure it's toggled on in Settings → Skills. Also make sure your prompt clearly indicates deck / presentation / PowerPoint intent — the skill description is how Claude decides whether to load it.

**"Claude Code doesn't see the skill"** — wrong path. `SKILL.md` must be at `~/.claude/skills/deck-create/SKILL.md` or `~/.claude/skills/deck-publish/SKILL.md` (one level deep, not two).

**"Slash commands don't work in Claude Code"** — `.md` files must be at `~/.claude/commands/deck-*.md`, not nested in a `commands/` subfolder. If you unzipped `commands.zip` into `~/.claude/skills/` or some other path by accident, move the files to `~/.claude/commands/`.

**"Editable PPTX output looks wrong"** — see `deck-publish/references/troubleshooting.md` inside the installed skill. The most common fix is adding `--use-background-images` (keeps editable foreground text over a screenshot background) or falling back to screenshot mode (`/deck-publish ... --to pptx` without `--editable`).

**"Brand file not being applied"** — must be `brand.yaml`, `brand.yml`, or `brand.json` (lowercase), and live either in the HTML's directory or in `./brand/`. Force a specific path with `--brand <path>`.
