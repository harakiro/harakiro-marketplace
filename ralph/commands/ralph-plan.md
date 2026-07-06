---
description: Create ROADMAP from PRD (first run) or plan the next feature
---

# Ralph Plan - Feature Planning

Plan the next feature by creating architecture and task documents.

**Model:** Planning uses **Opus** — architecture and task decomposition warrant an advanced model regardless of the session default.

## Execution

Spawn a Task agent with `subagent_type: "general-purpose"` and `model: "opus"`
to perform the planning work below and return the created file contents.
After it completes, write the returned content to the appropriate files and
commit. For large or unfamiliar codebases, first dispatch an `Explore` agent
(read-only) to map the relevant modules and include its report in the
planning agent's prompt.

---

## Two Modes

### Mode 1: First Run (no ROADMAP.md exists)

1. Read `PRD.md` at project root
2. Create `.ralph/ROADMAP.md`:
   - Break PRD into features
   - Organize into phases (Foundation → Core → Enhancements)
   - Note dependencies between features
   - Assign priorities (HIGH/MEDIUM/LOW)

3. Initialize `.ralph/progress.txt` with feature queue
4. Continue to Mode 2 for first feature

### Mode 2: Plan Next Feature (ROADMAP.md exists)

1. Read `.ralph/progress.txt` - identify next feature
2. Read `PRD.md` and `.ralph/ROADMAP.md` for context

3. Create `.ralph/architecture/ARCH_<feature>.md`:
   - Component design
   - Data model changes
   - API endpoints
   - Sequence diagrams
   - Technical decisions

4. Create `.ralph/features/FEAT_<feature>.md`:
   - Task breakdown with FEAT-NNN IDs
   - Each task has: Status, Depends, Size, Description, Acceptance Criteria, Files
   - Order: data model → service → routes → tests → UI

5. Update `.ralph/progress.txt`:
   - Set Feature: <feature-slug>
   - Set Task: FEAT-001
   - Set Status: BUILDING
   - Populate Task Queue

6. Commit: `plan: Break down <feature> into tasks`

## Task Sizing Guidelines

**Prefer fewer, larger tasks over many tiny ones.**

- Group related changes into single tasks (e.g., "Create User model + service + tests" as ONE task)
- Target **3-7 tasks per feature**, not 10-15
- Each task should be a meaningful, cohesive unit of work
- Only split into separate tasks if truly independent or has different dependencies

Size guide:
- **S** (Small): Single concern, 1-3 files — simple utility, minor enhancement
- **M** (Medium): Related concern, 3-6 files — typical feature task
- **L** (Large): Complex concern, 6+ files — only if can't be split without losing cohesion

**Bad example** (too granular):
- FEAT-001: Create User interface
- FEAT-002: Create User model
- FEAT-003: Create UserService
- FEAT-004: Add UserService tests
- FEAT-005: Create user routes

**Good example** (cohesive):
- FEAT-001: Implement User model and service with tests
- FEAT-002: Implement user API routes with tests

## Task Format

```markdown
### FEAT-001: Task Title

**Status:** TODO
**Depends:** (none) | FEAT-000
**Size:** S | M | L

**Description:**
What to implement — be specific about all components included.

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests pass

**Files:**
- Create: `src/path/file.ts`
- Create: `src/path/other.ts`
- Test: `tests/path/file.test.ts`
```

## Output

Report:
- Tasks created (count)
- First task ID and title
- Files created
