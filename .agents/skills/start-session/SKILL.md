---
name: start-session
description: Initialize or resume Ntalo development by reading project state, PRD, git state and tests before coding
---

# Start Session

This skill initializes or resumes a Ntalo development session.

## Procedure
1. Read `@docs/PRD.md` to ground requirements in the product source of truth.
2. Read `@docs/CURRENT_STATE.md` to identify current milestone, completed work, and the exact next task.
3. Read `@AGENTS.md` and applicable rules in `.agents/rules/`.
4. Run `git status` and review recent commits.
5. Inspect existing files and implementations related to the current task before writing any code.
6. Run baseline test commands to ensure the environment is green.
7. Explicitly state to the user:
   - **Goal of the session**
   - **Affected files & components**
   - **Expected behavior**
   - **Key risks & edge cases to watch**
8. Do not begin modifying code until the existing state is fully understood.
