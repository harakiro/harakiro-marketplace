# Ralph Agent Marketplace

A Claude Code plugin marketplace containing the Ralph Agent plugin.

## Installation

```bash
# 1. Download and unzip the marketplace
unzip ralph-marketplace.zip

# 2. In Claude Code, add this marketplace
/plugin marketplace add /path/to/ralph-marketplace

# 3. Install the Ralph plugin
/plugin install ralph@ralph-marketplace

# 4. Restart Claude Code to load the new commands
```

## Available Plugins

### ralph

Iterative development loop for AI coding assistants.

**Commands:**
- `/ralph-init` - Initialize Ralph in project
- `/ralph-onboard` - Analyze existing codebase
- `/ralph-plan` - Plan features and tasks
- `/ralph-build` - Implement tasks
- `/ralph-feedback` - Parse raw feedback
- `/ralph-review` - Create fix tasks
- `/ralph-status` - Show progress

See `ralph/README.md` for detailed usage.

## Publishing to GitHub

To make this marketplace publicly installable:

1. Push to a GitHub repository
2. Users can then install with:
   ```
   /plugin marketplace add your-username/ralph-marketplace
   /plugin install ralph@your-username
   ```
