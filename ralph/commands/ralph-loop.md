---
description: Automatically build entire feature using Task agents for clean context
---

# Ralph Loop - Automated Feature Builder

Build the current feature to completion using Task agents. Each agent handles up to 2 tasks with fresh context, eliminating compaction risk.

**Model:** This command uses **Sonnet** for cost-effective code implementation.

## Instructions

### 1. Read Initial State

Read `.ralph/progress.txt` to get:
- Current feature slug
- Current task ID
- Feature status

If no feature is active or status is APPROVED/COMPLETE, stop and suggest `/ralph:ralph-plan`.

### 2. Initialize Loop State

Create/update `.ralph/loop-state.json`:
```json
{
  "active": true,
  "feature": "<feature-slug>",
  "started": "<ISO timestamp>",
  "iteration": 0,
  "tasksCompleted": [],
  "status": "RUNNING"
}
```

### 3. Execute Build Loop

**Repeat until feature complete:**

a) Increment `iteration` in loop-state.json

b) Spawn a Task agent with `subagent_type: "coder"` and `model: "sonnet"`:

```
Task: Ralph Build Batch - Iteration {N}

Working directory: {cwd}

Execute exactly 2 tasks (or remaining tasks if fewer) for the current feature.

Instructions:
1. Read `.ralph/progress.txt` to get current task
2. Read `.ralph/features/FEAT_{feature}.md` for task details
3. Read `CLAUDE.md` for project patterns

For each task (max 2):
1. Run pre-flight: `pnpm test && pnpm typecheck` (fix failures first)
2. Implement the task following acceptance criteria
3. Write tests for new code
4. Verify: `pnpm test && pnpm typecheck`
5. Commit with conventional message (stage specific files, not `git add .`)
6. Update `.ralph/progress.txt`:
   - Move task to Completed with date
   - Set next task in queue
7. Commit progress update

Do NOT:
- Start dev servers
- Modify .env files
- Push to remote
- Skip tests

Return JSON result:
{
  "tasksCompleted": ["FEAT-XXX", "FEAT-YYY"],
  "commits": ["<hash> <message>", ...],
  "testsStatus": "passing|failing",
  "nextTask": "FEAT-ZZZ" or null,
  "featureComplete": true|false,
  "error": null or "<description>"
}
```

c) Parse agent result:
   - If `error`: Stop loop, report error, set loop-state status to "ERROR"
   - If `featureComplete`: Exit loop successfully
   - If `nextTask`: Continue to next iteration

d) Update loop-state.json with completed tasks

### 4. Completion

When feature is complete:

1. Update `.ralph/loop-state.json`:
```json
{
  "active": false,
  "status": "COMPLETE",
  "finished": "<ISO timestamp>",
  "totalIterations": N,
  "tasksCompleted": [...]
}
```

2. Output summary:
```
FEATURE COMPLETE: {feature-slug}

Iterations: {N}
Tasks completed: {count}
  - FEAT-001: Title
  - FEAT-002: Title
  ...

Total commits: {count}
All tests: PASSING

Next: Run `/ralph:ralph-plan` for next feature
```

3. Output `<ralph:feature-complete/>`

## Error Handling

If a Task agent fails or returns an error:

1. Set loop-state.json status to "PAUSED"
2. Output:
```
LOOP PAUSED: {error description}

Last successful task: FEAT-XXX
Failed at: FEAT-YYY

To investigate: Check test output and .ralph/progress.txt
To resume: Run /ralph:ralph-loop
To abort: Run /ralph:ralph-cancel
```

## Cancel Loop

To cancel an active loop, the user can:
- Run `/ralph:ralph-cancel` (sets loop-state.json active=false)
- Manually edit `.ralph/loop-state.json`

## Do NOT

- Run more than one Task agent at a time (sequential execution)
- Skip the Task agent spawning (this ensures fresh context)
- Continue if tests are failing
- Push to remote
