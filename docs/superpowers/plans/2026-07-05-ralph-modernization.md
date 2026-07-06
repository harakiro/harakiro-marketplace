# Ralph Plugin Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the ralph plugin (v1.0.0 → v2.0.0) to remove design assumptions built for older, smaller-context models, then reinstall it from source.

**Architecture:** Ralph's durable value — the `.ralph/` state files (progress.txt, ROADMAP.md, FEAT_*.md, ARCH_*.md, feedback files) and the plan → build → feedback → review cycle — is kept exactly as-is, so existing `.ralph/` directories in 16+ projects remain compatible. What changes: (1) the loop no longer caps agents at 2 tasks — one fresh-context agent builds the whole feature, with re-dispatch only as failure recovery; (2) hardcoded model routing (`opus`/`sonnet`/`haiku`) is removed — commands inherit the session model; (3) trivial commands (init/status/cancel/review) run inline instead of spawning agents; (4) invalid `subagent_type` values (`coder`, `planner`, `researcher`, `analyst`) are replaced with real agent types (`general-purpose`, `Explore`); (5) hardcoded `pnpm test && pnpm typecheck` becomes "use the project's commands from CLAUDE.md"; (6) decorative `<promise>COMPLETE</promise>` / `<ralph:feature-complete/>` sentinels are dropped.

**Tech Stack:** Markdown command specs only (no executable code). Repo: `~/Development/harakiro-marketplace` (git, remote `harakiro/harakiro-marketplace`). Plugin manifest: `ralph/.claude-plugin/plugin.json`.

## Global Constraints

- Preserve the `.ralph/` file formats verbatim (progress.txt fields, FEAT-NNN/FIX-NNN/ENH-NNN IDs, loop-state.json keys) — existing project state must keep working.
- Never hardcode a model name in any command file. Where a subagent is still used, omit the model so it inherits the session model.
- Only these `subagent_type` values may appear: `general-purpose`, `Explore`.
- Keep the safety rules in build/loop: no dev servers, no .env edits, no push to remote, no `git add .`.
- Version becomes exactly `2.0.0` in `ralph/.claude-plugin/plugin.json`.
- No `<promise>COMPLETE</promise>` or `<ralph:feature-complete/>` strings anywhere in `ralph/` after this plan.
- Verification is via `grep` (this is a docs-only repo — no test runner).
- Implementation tasks (1–5) edit files only. Do NOT commit — Task 6 (main session) reviews the diff, commits once, pushes, and reinstalls.

---

### Task 1: Rewrite `ralph-loop.md` — whole-feature batches, no model hardcode

**Files:**
- Modify: `ralph/commands/ralph-loop.md` (full rewrite)

**Interfaces:**
- Produces: the JSON return contract (`tasksCompleted`, `commits`, `testsStatus`, `nextTask`, `featureComplete`, `error`) and `loop-state.json` keys (`active`, `feature`, `started`, `iteration`, `tasksCompleted`, `status`) — unchanged, consumed by ralph-cancel (Task 3) and ralph-status (Task 3).

- [ ] **Step 1: Replace the entire content of `ralph/commands/ralph-loop.md` with:**

````markdown
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
````

- [ ] **Step 2: Verify**

Run: `grep -nE 'sonnet|opus|haiku|max 2|exactly 2|"coder"|<promise>|<ralph:' ~/Development/harakiro-marketplace/ralph/commands/ralph-loop.md`
Expected: no output (exit code 1)

---

### Task 2: Update `ralph-build.md` — remove the 2-task cap, generalize commands

**Files:**
- Modify: `ralph/commands/ralph-build.md` (full rewrite)

**Interfaces:**
- Consumes: nothing from other tasks. Produces the same progress.txt update convention as Task 1's agent prompt.

- [ ] **Step 1: Replace the entire content of `ralph/commands/ralph-build.md` with:**

````markdown
---
description: Implement the next task from the queue
---

# Ralph Build - Task Implementation

Implement tasks from the queue, verify each works, commit, and update progress.

**For hands-off feature building with a clean context per run, use `/ralph:ralph-loop` instead.**

## Build Workflow

### 1. Read State
- Read `.ralph/progress.txt` → get current task
- Read `.ralph/features/FEAT_<feature>.md` → get task details
- Read `CLAUDE.md` → follow project patterns and use its documented dev commands

### 2. Pre-flight Check

Run the project's test and typecheck commands (from CLAUDE.md, e.g. `pnpm test`, `npm test`, `pytest`):
If either fails, FIX IT FIRST before new work.

### 3. Implement Task
- Follow the acceptance criteria exactly
- Write tests for new code
- Follow project patterns from CLAUDE.md

### 4. Verify

Re-run the project's test and typecheck commands. ALL tests must pass, zero type errors.
If anything fails, fix before committing.

### 5. Commit
- Stage specific files (NOT `git add .`)
- Use conventional commit: `feat:`, `fix:`, `test:`, `refactor:`

```bash
git add src/path/file.ts tests/path/file.test.ts
git commit -m "feat: Add UserService with CRUD operations"
```

### 6. Update Progress
- Move task to Completed section with date
- Set next task in queue

```bash
git add .ralph/progress.txt
git commit -m "progress: Complete FEAT-001"
```

### 7. Continue or Stop
- If more tasks remain: continue to the next task. Stop early only if you
  hit a blocker (failing tests you can't fix, missing information) or the
  user asked for a specific number of tasks
- If feature complete: verify all tests pass, report completion

## Quality Gates

Before committing ANY task:
- [ ] Code compiles
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] ALL tests pass
- [ ] Conventional commit message

## Do NOT

- Start dev servers
- Modify .env files
- Push to remote
- Skip tests
- Use `git add .`

## Output

After completing work:

```
BUILD COMPLETE

Tasks completed this run:
  - FEAT-XXX: Title
  - FEAT-YYY: Title

Files created: [list]
Files modified: [list]
Tests: X passing
Commits: [list]

Feature status: {X of Y tasks done} or COMPLETE
Next task: FEAT-ZZZ or (none - feature complete)
```
````

- [ ] **Step 2: Verify**

Run: `grep -nE 'max 2|<promise>|pnpm test        #' ~/Development/harakiro-marketplace/ralph/commands/ralph-build.md`
Expected: no output

---

### Task 3: Inline the utility commands — `ralph-init.md`, `ralph-status.md`, `ralph-cancel.md`

These three spawn Opus/Haiku agents to create a directory, read one file, or edit one JSON field. Remove all agent spawning; do the work directly in the session.

**Files:**
- Modify: `ralph/commands/ralph-init.md`
- Modify: `ralph/commands/ralph-status.md`
- Modify: `ralph/commands/ralph-cancel.md`

**Interfaces:**
- Consumes: `loop-state.json` keys from Task 1 (unchanged).

- [ ] **Step 1: In `ralph-init.md`, replace lines 9–15 (the Model note + Execution section):**

Old:
```markdown
**Model:** This command uses **Opus** for thorough project setup.

## Execution

Spawn a Task agent with `model: "opus"` and `subagent_type: "planner"` to initialize the project structure. The agent should follow the instructions below.

---
```

New:
```markdown
Do this directly in the current session — no subagent needed.
```

- [ ] **Step 2: In `ralph-status.md`, replace lines 9–16 (Model note + Execution section):**

Old:
```markdown
**Model:** This command uses **Haiku** for fast, simple status display.

## Execution

Spawn a Task agent with `model: "haiku"` and `subagent_type: "general-purpose"` to read and display status.

---
```

New:
```markdown
Do this directly in the current session — read the file and format it; no subagent needed.
```

- [ ] **Step 3: In `ralph-cancel.md`, replace lines 9–16 (Model note + Execution section) with the same inline note as Step 2, and delete the final line `5. Output <promise>COMPLETE</promise>` (renumber not needed — just remove the item).**

Old (two separate edits):
```markdown
**Model:** This command uses **Haiku** for fast, simple state update.

## Execution

Spawn a Task agent with `model: "haiku"` and `subagent_type: "general-purpose"` to update loop state.

---
```
and
```markdown
5. Output `<promise>COMPLETE</promise>`
```

New: first becomes
```markdown
Do this directly in the current session — a one-field JSON update; no subagent needed.
```
and the second is deleted entirely.

- [ ] **Step 4: Verify**

Run: `grep -nE 'opus|haiku|Spawn a Task|<promise>' ~/Development/harakiro-marketplace/ralph/commands/ralph-init.md ~/Development/harakiro-marketplace/ralph/commands/ralph-status.md ~/Development/harakiro-marketplace/ralph/commands/ralph-cancel.md`
Expected: no output

---

### Task 4: Fix execution sections in `ralph-plan.md`, `ralph-onboard.md`, `ralph-review.md`, `ralph-feedback.md`

**Files:**
- Modify: `ralph/commands/ralph-plan.md`
- Modify: `ralph/commands/ralph-onboard.md`
- Modify: `ralph/commands/ralph-review.md`
- Modify: `ralph/commands/ralph-feedback.md`

**Interfaces:**
- Consumes: task sizing/format sections of ralph-plan.md — keep those verbatim (they are good guidance regardless of model).

- [ ] **Step 1: In `ralph-plan.md`, replace lines 9–16 (Model note + Execution section):**

Old:
```markdown
**Model:** This command uses **Opus** for complex architectural decisions.

## Execution

Spawn a Task agent with `model: "opus"` and `subagent_type: "planner"` to perform the planning work. The agent should follow the instructions below and return the created file contents.

After the agent completes, write the returned content to the appropriate files and commit.

---
```

New:
```markdown
## Execution

Plan directly in the current session — it has the conversation context a
subagent would lack. For large or unfamiliar codebases, first dispatch an
`Explore` agent (read-only) to map the relevant modules, then plan with
its report in hand.

---
```

- [ ] **Step 2: In `ralph-plan.md`, delete the trailing sentinel line:**

Old: `Then output <promise>COMPLETE</promise>.` — delete the line (keep the Output report list above it).

- [ ] **Step 3: In `ralph-onboard.md`, replace lines 9–16 (Model note + Execution section):**

Old:
```markdown
**Model:** This command uses **Opus** for comprehensive codebase analysis.

## Execution

Spawn a Task agent with `model: "opus"` and `subagent_type: "researcher"` to analyze the codebase. The agent should follow the instructions below and return the document contents.

After the agent completes, write the returned content to the appropriate files and commit.

---
```

New:
```markdown
## Execution

Dispatch an `Explore` agent (read-only, thorough) to scan the codebase:
structure, tech stack, patterns from 3-5 representative files, existing
docs. Then write the documents below in the current session using its
report, and commit.

---
```

- [ ] **Step 4: In `ralph-onboard.md`, delete the trailing sentinel line `Then output <promise>COMPLETE</promise>.`**

- [ ] **Step 5: In `ralph-review.md`, replace lines 9–16 (Model note + Execution section):**

Old:
```markdown
**Model:** This command uses **Opus** for nuanced feedback analysis.

## Execution

Spawn a Task agent with `model: "opus"` and `subagent_type: "analyst"` to analyze feedback and create fix tasks. The agent should follow the instructions below and return the task definitions and progress updates.

After the agent completes, write the returned content to the appropriate files and commit.

---
```

New:
```markdown
Do this directly in the current session — no subagent needed.
```

- [ ] **Step 6: In `ralph-review.md` and `ralph-feedback.md`, delete the trailing line `Then output <promise>COMPLETE</promise>.` from each.**

- [ ] **Step 7: Verify**

Run: `grep -rnE '"opus"|"sonnet"|"haiku"|"planner"|"researcher"|"analyst"|"coder"|<promise>|<ralph:' ~/Development/harakiro-marketplace/ralph/commands/`
Expected: no output

---

### Task 5: Update `README.md`, `plugin.json`, and marketplace entry

**Files:**
- Modify: `ralph/README.md`
- Modify: `ralph/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: In `ralph/README.md`, replace the Commands table (lines 18–28):**

New:
```markdown
| Command | Description |
|---------|-------------|
| `/ralph:ralph-init` | Initialize Ralph in current project |
| `/ralph:ralph-onboard` | Analyze existing codebase, create CLAUDE.md + PRD.md |
| `/ralph:ralph-plan` | Create ROADMAP from PRD or plan next feature |
| `/ralph:ralph-build` | Implement tasks in the current session (manual) |
| `/ralph:ralph-loop` | **Automated**: build the entire feature via fresh-context Task agents |
| `/ralph:ralph-cancel` | Cancel an active loop |
| `/ralph:ralph-feedback` | Parse raw feedback into structured format |
| `/ralph:ralph-review` | Create FIX tasks from feedback |
| `/ralph:ralph-status` | Show current progress |

All commands inherit the session model.
```

- [ ] **Step 2: In `ralph/README.md`, replace the "How `/ralph:ralph-loop` Works" section (lines 57–64):**

New:
```markdown
### How `/ralph:ralph-loop` Works

The loop dispatches a **Task agent** with fresh context to build the whole
feature. If an agent stops early (blocker, error), the orchestrator
re-dispatches a new agent with the remaining tasks — iterations are
failure recovery, not fixed-size batching. Progress is tracked in
`.ralph/loop-state.json` and `.ralph/progress.txt`, so the loop can resume
from wherever it stopped.
```

- [ ] **Step 3: In `ralph/README.md`, replace "The Loop" section (lines 89–100):**

New:
```markdown
## The Loop

Ralph supports two modes of operation:

**Manual mode** (`/ralph:ralph-build`): Executes tasks in the current session. Useful for step-by-step control and mid-task course correction.

**Automated mode** (`/ralph:ralph-loop`): Dispatches fresh-context Task agents to build the entire feature. The loop continues until:
- Feature is complete
- The same task fails twice (loop pauses)
- User cancels with `/ralph:ralph-cancel`
```

- [ ] **Step 4: In `ralph/.claude-plugin/plugin.json`, change `"version": "1.0.0"` to `"version": "2.0.0"`.**

- [ ] **Step 5: In `.claude-plugin/marketplace.json`, update the ralph entry description:**

Old: `"description": "Automated AI development loop — Plan with Opus, build with Sonnet, iterate until done"`
New: `"description": "Automated AI development loop — plan, build with fresh-context agents, iterate until done"`

- [ ] **Step 6: Verify**

Run: `grep -rnE 'Opus|Sonnet|Haiku|<promise>|2 tasks per agent|handles 2 tasks' ~/Development/harakiro-marketplace/ralph/README.md ~/Development/harakiro-marketplace/.claude-plugin/marketplace.json; grep -n '"version"' ~/Development/harakiro-marketplace/ralph/.claude-plugin/plugin.json`
Expected: only the version line, showing `"version": "2.0.0"`

---

### Task 6: Review, commit, push, reinstall (main session — not the implementation agent)

- [ ] **Step 1: Review the full diff** (`git -C ~/Development/harakiro-marketplace diff`) against this plan's Global Constraints.

- [ ] **Step 2: Commit everything in one commit:**

```bash
git -C ~/Development/harakiro-marketplace add ralph/ .claude-plugin/marketplace.json docs/
git -C ~/Development/harakiro-marketplace commit -m "feat(ralph): v2.0.0 — modernize for current models

Whole-feature loop batches (2-task cap removed), session-model
inheritance (opus/sonnet/haiku hardcodes removed), inline utility
commands, real subagent types, project-detected test commands,
sentinel strings dropped. .ralph/ state formats unchanged."
```

- [ ] **Step 3: Push to origin** (`git -C ~/Development/harakiro-marketplace push origin main`) — required because the installed marketplace pulls from GitHub.

- [ ] **Step 4: Reinstall the plugin** — refresh the marketplace and reinstall ralph (CLI if available: `claude plugin marketplace update harakiro-marketplace && claude plugin install ralph@harakiro-marketplace`; otherwise instruct the user to run `/plugin` in the TUI).

- [ ] **Step 5: Verify installed version:** `~/.claude/plugins/installed_plugins.json` shows ralph version `2.0.0`, and the cached command files at `~/.claude/plugins/cache/harakiro-marketplace/ralph/2.0.0/commands/` contain no `opus|sonnet|haiku|<promise>` matches.
