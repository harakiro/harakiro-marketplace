---
description: Automatically build entire feature using Task agents for clean context
---

# Ralph Loop - Automated Feature Builder

Build the current feature to completion using Task agents. By default a single fresh-context agent executes the whole feature; the loop re-dispatches an agent with the remaining tasks only when the previous agent stops early (error or blocker). Iterations are failure recovery, not fixed-size batching.

**Model:** Inherits the session model. Do NOT set a model override when spawning agents.

## Instructions

### 1. Read Initial State

Read `.ralph/progress.txt` to get:
- Current feature slug
- Current task ID
- Feature status

If no feature is active or status is APPROVED/COMPLETE, stop and suggest `/ralph:ralph-plan`.

Determine the project's verification commands: read `CLAUDE.md` for documented test/typecheck/lint commands. If not documented, detect them (package.json scripts, pytest.ini, etc.) and use those. Refer to them below as `{test-command}` and `{typecheck-command}`.

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

**Repeat until feature complete or an unrecoverable error:**

a) Increment `iteration` in loop-state.json

b) Spawn a Task agent with `subagent_type: "general-purpose"` (no model override):

```
Task: Ralph Build - Iteration {N}

Working directory: {cwd}

Execute ALL remaining tasks for the current feature, in dependency order.

Instructions:
1. Read `.ralph/progress.txt` to get the current task and queue
2. Read `.ralph/features/FEAT_{feature}.md` for task details
3. Read `CLAUDE.md` for project patterns and dev commands

For each remaining task:
1. Run pre-flight: {test-command} && {typecheck-command} (fix failures first)
2. Implement the task following acceptance criteria
3. Write tests for new code
4. Verify: {test-command} && {typecheck-command}
5. Commit with conventional message (stage specific files, not `git add .`)
6. Update `.ralph/progress.txt`:
   - Move task to Completed with date
   - Set next task in queue
7. Commit progress update

If you hit a blocker you cannot resolve (failing tests you can't fix,
missing information, ambiguous acceptance criteria), STOP there and
return partial results with `error` describing the blocker. Completed
tasks stay completed — the loop resumes from the next task.

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
   - If `featureComplete`: exit loop successfully
   - If `error`: report it. If the blocker looks transient or the agent
     made partial progress, dispatch the next iteration with the remaining
     tasks (fresh context often clears a stuck agent). If the same task
     fails twice, stop the loop and set loop-state status to "PAUSED"
   - If the agent stopped early without an error: continue to the next
     iteration (remaining tasks, fresh context)

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

## Error Handling

If the same task fails in two consecutive iterations:

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

- Run more than one Task agent at a time (tasks share repo state —
  progress.txt updates and commits must stay atomic)
- Implement tasks directly in the orchestrating session (the Task agent
  gives each build a clean context)
- Continue if tests are failing
- Push to remote
