# Ralph Agent Plugin for Claude Code

> An iterative development loop for AI coding assistants.
> **Philosophy:** Iteration beats perfection. Small commits beat big bangs.

## Installation

### Option 1: Local Installation (for testing)

```bash
# 1. Unzip and navigate to the marketplace
unzip ralph-marketplace.zip
cd ralph-marketplace

# 2. In Claude Code, add the marketplace
/plugin marketplace add ./ralph-marketplace

# 3. Install the plugin
/plugin install ralph@ralph-marketplace

# 4. Restart Claude Code
```

### Option 2: From GitHub (when published)

```
/plugin marketplace add your-org/ralph-marketplace
/plugin install ralph@your-org
```

## Commands

| Command | Description |
|---------|-------------|
| `/ralph:ralph-init` | Initialize Ralph in current project |
| `/ralph:ralph-onboard` | Analyze existing codebase, create CLAUDE.md + PRD.md |
| `/ralph:ralph-plan` | Create ROADMAP from PRD or plan next feature |
| `/ralph:ralph-build` | Implement the next task (manual, up to 2 tasks) |
| `/ralph:ralph-loop` | **Automated**: Build entire feature using Task agents |
| `/ralph:ralph-cancel` | Cancel an active loop |
| `/ralph:ralph-feedback` | Parse raw feedback into structured format |
| `/ralph:ralph-review` | Create FIX tasks from feedback |
| `/ralph:ralph-status` | Show current progress |

## Workflows

### New Project

```
/ralph:ralph-init          # Set up .ralph directory
# Create PRD.md with your requirements
/ralph:ralph-plan          # Creates ROADMAP + first feature tasks
/ralph:ralph-loop          # Builds entire feature automatically
# Test manually...
/ralph:ralph-feedback user-auth "bugs found..."
/ralph:ralph-review        # Create FIX tasks
/ralph:ralph-loop          # Implement all fixes automatically
# Repeat until approved
/ralph:ralph-plan          # Next feature
```

### Existing Project

```
/ralph:ralph-init          # Set up .ralph directory
/ralph:ralph-onboard       # Analyzes code, creates CLAUDE.md + PRD.md
# Review generated docs, add planned features
/ralph:ralph-plan          # Plan first feature
/ralph:ralph-loop          # Build entire feature automatically
```

### How `/ralph:ralph-loop` Works

The loop command spawns **Task agents** for each batch of work (2 tasks per agent). Each agent has fresh context, which:
- Prevents context compaction mid-task
- Ensures clean state for each batch
- Allows features to complete without manual intervention

The orchestrator tracks progress in `.ralph/loop-state.json` and continues spawning agents until the feature is complete or an error occurs.

## Files Created

```
.ralph/
├── progress.txt          # Current state
├── loop-state.json       # Loop execution state (created by /ralph:ralph-loop)
├── ROADMAP.md            # Feature list (created by /ralph:ralph-plan)
├── architecture/         # Technical designs
│   └── ARCH_<feature>.md
├── features/             # Task breakdowns
│   └── FEAT_<feature>.md
└── feedback/             # Structured feedback
    └── <feature>_review_<N>.md
```

## Task IDs

| Prefix | Meaning | Created By |
|--------|---------|------------|
| FEAT-NNN | Feature task | /ralph-plan |
| FIX-NNN | Bug fix | /ralph-review |
| ENH-NNN | Deferred enhancement | /ralph-review |

## The Loop

Ralph supports two modes of operation:

**Manual mode** (`/ralph:ralph-build`): Executes up to 2 tasks, then stops. Useful for step-by-step control.

**Automated mode** (`/ralph:ralph-loop`): Spawns Task agents to build the entire feature. Each agent handles 2 tasks with fresh context, preventing compaction issues. The loop continues until:
- Feature is complete
- An error occurs (tests fail, etc.)
- User cancels with `/ralph:ralph-cancel`

Commands output `<promise>COMPLETE</promise>` to signal completion. The loop command also uses `<ralph:feature-complete/>` to indicate a feature is done.

## License

MIT
