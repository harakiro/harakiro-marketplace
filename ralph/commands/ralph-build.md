---
description: Implement the next task from the queue
---

# Ralph Build - Task Implementation

Implement the next task from the queue, verify it works, commit, and update progress.

**For automated feature building, use `/ralph:ralph-loop` instead.**

## Build Workflow

### 1. Read State
- Read `.ralph/progress.txt` → get current task
- Read `.ralph/features/FEAT_<feature>.md` → get task details
- Read `CLAUDE.md` → follow project patterns

### 2. Pre-flight Check
```bash
pnpm test        # or npm test, pytest, etc.
pnpm typecheck   # if applicable
```
If either fails, FIX IT FIRST before new work.

### 3. Implement Task
- Follow the acceptance criteria exactly
- Write tests for new code
- Follow project patterns from CLAUDE.md

### 4. Verify
```bash
pnpm test        # ALL tests must pass
pnpm typecheck   # Zero errors
```
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
- If more tasks in feature: continue to next task (max 2 per invocation)
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

Then output `<promise>COMPLETE</promise>`.
