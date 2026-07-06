# Ralph Agent Plugin for Claude Code

> An iterative development loop for AI coding assistants.
> **Philosophy:** Iteration beats perfection. Small commits beat big bangs.

## Installation

```bash
# Add the marketplace
/plugin marketplace add harakiro/harakiro-marketplace

# Install the plugin
/plugin install ralph@harakiro-marketplace
```

## Commands

| Command | Model | Description |
|---------|-------|-------------|
| `/ralph:ralph-init` | Session | Initialize Ralph in current project |
| `/ralph:ralph-onboard` | **Opus** | Analyze existing codebase, create CLAUDE.md + PRD.md |
| `/ralph:ralph-plan` | **Opus** | Create ROADMAP from PRD or plan next feature |
| `/ralph:ralph-build` | Session | Implement tasks in the current session (manual) |
| `/ralph:ralph-loop` | **Sonnet** | **Automated**: build the entire feature via fresh-context Task agents |
| `/ralph:ralph-cancel` | Session | Cancel an active loop |
| `/ralph:ralph-feedback` | Session | Parse raw feedback into structured format |
| `/ralph:ralph-review` | Session | Create FIX tasks from feedback |
| `/ralph:ralph-status` | Session | Show current progress |

**Model routing:** planning and onboarding are pinned to Opus (architecture-class analysis warrants an advanced model), loop build agents are pinned to Sonnet (cost-efficient implementation of well-scoped tasks). Everything else runs inline and inherits the session model.

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

The loop dispatches a **Sonnet Task agent** with fresh context to build the
whole feature. If an agent stops early (blocker, error), the orchestrator
re-dispatches a new agent with the remaining tasks — iterations are
failure recovery, not fixed-size batching. Progress is tracked in
`.ralph/loop-state.json` and `.ralph/progress.txt`, so the loop can resume
from wherever it stopped.

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
| FEAT-NNN | Feature task | `/ralph:ralph-plan` |
| FIX-NNN | Bug fix | `/ralph:ralph-review` |
| ENH-NNN | Deferred enhancement | `/ralph:ralph-review` |

## The Loop

Ralph supports two modes of operation:

**Manual mode** (`/ralph:ralph-build`): Executes tasks in the current session. Useful for step-by-step control and mid-task course correction.

**Automated mode** (`/ralph:ralph-loop`): Dispatches fresh-context Task agents to build the entire feature. The loop continues until:
- Feature is complete
- The same task fails twice (loop pauses)
- User cancels with `/ralph:ralph-cancel`

## License

MIT
