---
description: Parse raw feedback into structured format for review
argument: feature - The feature slug (e.g., user-auth)
---

# Ralph Feedback - Parse Raw Feedback

Convert unstructured feedback into a structured format for the REVIEW phase.

## Arguments

The user should provide:
- **feature**: Feature slug being reviewed (required)
- **input**: Raw feedback text or file path (ask if not provided)

## Process

1. **Identify the Feature**
   - Use the provided feature argument
   - If not provided, ask: "What feature is this feedback for?"

2. **Get Raw Feedback**
   - If file path provided, read the file
   - If text provided, use directly
   - If neither, ask user to paste feedback

3. **Extract Issues**
   Parse and identify distinct problems:
   - Error messages → BUG
   - "It should..." statements → BUG or CHANGE
   - "It would be nice if..." → ENHANCEMENT
   - "This doesn't work..." → BUG
   - Performance complaints → BUG or ENHANCEMENT

4. **Classify Each Issue**
   
   **Type:**
   - BUG: Code doesn't work as specified
   - CHANGE: Works but needs modification
   - ENHANCEMENT: Nice-to-have, not in original spec
   
   **Severity:**
   - CRITICAL: Blocks usage, data loss, security
   - HIGH: Major feature broken
   - MEDIUM: Noticeable issues
   - LOW: Minor cosmetic/UX

5. **Create Structured File**

   Create `.ralph/feedback/<feature>_review_<N>.md`:

   ```markdown
   # Feedback: [Feature] — Review Cycle N

   > **Feature:** feature-slug
   > **Date:** YYYY-MM-DD
   > **Source:** [QA/user/self-review]

   ## Summary
   - Total Issues: X
   - Bugs: Y
   - Changes: Z
   - Enhancements: W

   ## Issues

   ### Issue 1: [Title]
   **Type:** BUG
   **Severity:** HIGH

   **Description:**
   [What's wrong]

   **Steps to Reproduce:**
   1. Step 1
   2. Step 2

   **Expected:** [What should happen]
   **Actual:** [What actually happens]

   ---

   ### Issue 2: [Title]
   ...
   ```

6. **Determine Cycle Number**
   - Check existing files in `.ralph/feedback/`
   - Increment from last cycle

## Output

```
FEEDBACK PARSED — [feature] Review Cycle N

Issues extracted: X
- CRITICAL: count
- HIGH: count
- MEDIUM: count
- LOW: count

Output: .ralph/feedback/<feature>_review_N.md

Next: Run /ralph-review to create fix tasks
```

Then output `<promise>COMPLETE</promise>`.
