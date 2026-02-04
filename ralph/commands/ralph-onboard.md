---
description: Analyze existing codebase and create foundational documents (CLAUDE.md, PRD.md, architecture docs)
---

# Ralph Onboard - Analyze Existing Codebase

Analyze this existing codebase and create the foundational documents that Ralph needs.

**Model:** This command uses **Opus** for comprehensive codebase analysis.

## Execution

Spawn a Task agent with `model: "opus"` and `subagent_type: "researcher"` to analyze the codebase. The agent should follow the instructions below and return the document contents.

After the agent completes, write the returned content to the appropriate files and commit.

---

## What to Create

1. **CLAUDE.md** at project root - Document:
   - Tech stack (language, framework, database)
   - Code patterns (read 3-5 examples of services, routes, tests)
   - Naming conventions
   - Development commands
   - Critical rules (NEVER/ALWAYS)

2. **PRD.md** at project root - Document:
   - What the project does (derived from code)
   - Existing features (list what's already built)
   - Identified gaps or incomplete features
   - Technical debt items

3. **.ralph/ROADMAP.md** - Document:
   - Existing features marked as COMPLETE
   - Incomplete features marked as PARTIAL
   - Suggested future work

4. **.ralph/architecture/ARCH_existing.md** - Document:
   - System overview
   - Component diagram
   - Data model
   - API endpoints
   - Service map

5. **.ralph/progress.txt** - Initialize with:
   - Status: ONBOARDED
   - Feature history showing pre-existing features

## Process

1. Scan project structure (`find`, `ls`, config files)
2. Identify tech stack from package.json, tsconfig, etc.
3. Read representative files to understand patterns
4. Read existing documentation (README, docs/)
5. Create all documents
6. Commit with message: `chore: Add Ralph Agent with onboarding analysis`

## Output

After completing, report:
- Tech stack identified
- Files created
- Existing features found
- Open questions for the user

Then output `<promise>COMPLETE</promise>`.
