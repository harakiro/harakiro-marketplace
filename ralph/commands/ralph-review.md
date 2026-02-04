---
description: Create FIX tasks from structured feedback
---

# Ralph Review - Process Feedback into Tasks

Convert structured feedback files into actionable FIX tasks.

**Model:** This command uses **Opus** for nuanced feedback analysis.

## Execution

Spawn a Task agent with `model: "opus"` and `subagent_type: "analyst"` to analyze feedback and create fix tasks. The agent should follow the instructions below and return the task definitions and progress updates.

After the agent completes, write the returned content to the appropriate files and commit.

---

## Prerequisites

A structured feedback file must exist at `.ralph/feedback/<feature>_review_<N>.md`
(Created by `/ralph-feedback`)

## Process

1. **Find Feedback File**
   ```bash
   ls .ralph/feedback/<feature>_review_*.md
   ```
   Read the latest unprocessed file.

2. **Read Current State**
   - `.ralph/progress.txt` → current feature, review cycle
   - `.ralph/features/FEAT_<feature>.md` → existing tasks

3. **Process Each Issue**

   | Type | Action |
   |------|--------|
   | BUG | Create FIX task |
   | CHANGE | Create FIX task |
   | ENHANCEMENT | Add to Deferred list |

   | Severity | Priority |
   |----------|----------|
   | CRITICAL | First in queue |
   | HIGH | Fix this cycle |
   | MEDIUM | Fix this cycle |
   | LOW | Can defer |

4. **Create FIX Tasks**

   Add to `.ralph/features/FEAT_<feature>.md`:

   ```markdown
   ## Review Cycle N

   ### FIX-001: [Issue title]

   **Status:** TODO
   **Type:** BUG
   **Severity:** HIGH
   **Review Cycle:** N
   **Reported:** YYYY-MM-DD

   **Description:**
   [What's broken]

   **Root Cause:** (if known)
   [Why it happened]

   **Acceptance Criteria:**
   - [ ] [Specific fix criterion]
   - [ ] Original functionality still works

   **Files:**
   - Modify: `src/path/file.ts`
   - Test: `tests/path/file.test.ts`
   ```

5. **Update progress.txt**

   ```
   ## Current State
   Feature: user-auth
   Task: FIX-001
   Status: BUILDING
   Review Cycle: N

   ## Task Queue
   1. FIX-001: [title]
   2. FIX-002: [title]

   ## Deferred
   - ENH-001: [enhancement description]
   ```

6. **Commit**
   ```bash
   git add .ralph/features/FEAT_<feature>.md .ralph/progress.txt
   git commit -m "review: Add fixes from review cycle N"
   ```

## Approval Criteria

Feature is APPROVED when:
- All BUG tasks DONE
- All CHANGE tasks DONE
- Tests pass
- No new issues found

Update status to APPROVED and move to Feature History.

## Output

```
REVIEW COMPLETE — [feature] Cycle N

Feedback file: .ralph/feedback/<feature>_review_N.md
Issues processed: X
- Bugs: count
- Changes: count
- Enhancements: count (deferred)

Tasks created:
- FIX-001: [title]
- FIX-002: [title]

Deferred:
- ENH-001: [title]

Next: Run /ralph:ralph-loop to implement fixes
```

Then output `<promise>COMPLETE</promise>`.
