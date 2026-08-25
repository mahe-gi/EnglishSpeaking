---
name: handoff
description: Finish a Ntalo development session by validating changes and updating CURRENT_STATE.md for the next agent
---

# Session Handoff

This skill safely concludes a development session and preserves context for subsequent agents.

## Procedure
1. Run all relevant automated tests, typechecks, and linters across modified packages.
2. Inspect `git status` and `git diff` to ensure clean working tree and no lingering debug statements or temporary files.
3. Update `@docs/CURRENT_STATE.md`:
   - Update `Last updated` date.
   - Update `Current milestone`.
   - Move completed items to `Completed`.
   - Explicitly write the `Next exact task` with clear step-by-step instructions.
   - Document any `Known bugs`, `Blockers`, or `Important decisions`.
   - List `Last verified commands`.
4. Ensure another agent can resume work immediately without needing chat history.
