---
description: Cancel an active Ralph Loop
---

# Ralph Cancel - Stop Active Loop

Cancel an active `/ralph:ralph-loop` execution.

**Model:** This command uses **Haiku** for fast, simple state update.

## Execution

Spawn a Task agent with `model: "haiku"` and `subagent_type: "general-purpose"` to update loop state.

---

## Instructions

1. Read `.ralph/loop-state.json`

2. If `active` is false:
   - Output: "No active loop to cancel."
   - Exit

3. Update `.ralph/loop-state.json`:
```json
{
  "active": false,
  "status": "CANCELLED",
  "cancelled": "<ISO timestamp>",
  ...existing fields preserved...
}
```

4. Output:
```
LOOP CANCELLED

Feature: {feature-slug}
Iterations completed: {N}
Tasks completed: {count}
  - FEAT-XXX: Title
  ...

Progress has been saved. To resume later:
  /ralph:ralph-loop

To start fresh on this feature:
  1. Reset tasks in .ralph/features/FEAT_{feature}.md
  2. Update .ralph/progress.txt
  3. /ralph:ralph-loop
```

5. Output `<promise>COMPLETE</promise>`
