# Harakiro Plugins

A Claude Code plugin marketplace.

## Installation

```bash
# Add the marketplace
/plugin marketplace add harakiro/claude-plugins-harakiro

# Install plugins
/plugin install ralph@harakiro-plugins
```

## Available Plugins

| Plugin | Description | Models |
|--------|-------------|--------|
| [ralph](./ralph) | Automated AI development loop | Opus, Sonnet, Haiku |

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
