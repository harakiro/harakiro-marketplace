---
description: Show current Ralph progress status
---

# Ralph Status

Display the current state of the Ralph Agent.

Do this directly in the current session — read the file and format it; no subagent needed.

## Instructions

1. Read `.ralph/progress.txt`

2. Display formatted status:

```
╔════════════════════════════════════════╗
║         RALPH AGENT STATUS             ║
╠════════════════════════════════════════╣
║ Feature:      [feature-slug]           ║
║ Task:         [FEAT-XXX / FIX-XXX]     ║
║ Status:       [PLANNING/BUILDING/...]  ║
║ Review Cycle: [N]                      ║
╠════════════════════════════════════════╣
║ Queue:                                 ║
║   1. FEAT-001: Task title              ║
║   2. FEAT-002: Task title              ║
╠════════════════════════════════════════╣
║ Completed:                             ║
║   ✓ FEAT-001: Task title               ║
╠════════════════════════════════════════╣
║ Blockers:                              ║
║   (none)                               ║
╚════════════════════════════════════════╝
```

3. Suggest next action:

| Status | Suggestion |
|--------|------------|
| INITIALIZED | Run `/ralph:ralph-onboard` (existing) or create PRD.md and `/ralph:ralph-plan` (new) |
| ONBOARDED | Review generated docs, then `/ralph:ralph-plan` |
| PLANNING | Finish planning or `/ralph:ralph-loop` |
| BUILDING | `/ralph:ralph-loop` to continue |
| REVIEWING | `/ralph:ralph-loop` to implement fixes |
| APPROVED | `/ralph:ralph-plan` for next feature |

4. If `.ralph/progress.txt` doesn't exist:
   - Suggest running `/ralph:ralph-init` first
