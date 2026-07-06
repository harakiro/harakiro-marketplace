---
description: Initialize Ralph Agent in the current project
---

# Initialize Ralph Agent

Set up the Ralph Agent directory structure in this project.

Do this directly in the current session — no subagent needed.

## Instructions

1. Create the `.ralph/` directory structure:
   ```
   .ralph/
   ├── architecture/
   ├── features/
   ├── feedback/
   └── templates/
   ```

2. Create `.ralph/progress.txt` with initial state:
   ```
   # Project — Progress Tracker

   ## Current State
   Feature: (none)
   Task: (none)
   Status: INITIALIZED
   Review Cycle: 0
   Updated: [TODAY'S DATE]

   ## Feature Queue
   (Run /ralph-plan to populate from PRD)

   ## Deferred
   (none)

   ## Completed (This Feature)
   (none)

   ## Feature History
   (none)

   ## Blockers
   (none)

   ## Decisions
   (none)
   ```

3. Report success and suggest next steps:
   - For NEW projects: Create PRD.md, then run `/ralph:ralph-plan`
   - For EXISTING projects: Run `/ralph:ralph-onboard` to analyze codebase

Output the created structure and next steps.
