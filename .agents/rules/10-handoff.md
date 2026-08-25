# Session Handoff Rules (Always On)

## Before Ending a Session
1. Run all relevant tests, typechecks (`npx tsc --noEmit`), and linters.
2. Inspect `git status` and `git diff` to ensure no accidental files or secrets are committed.
3. Update `@docs/CURRENT_STATE.md` with:
   - Current milestone
   - Completed items
   - In-progress items
   - Exact next task (with step-by-step instructions)
   - Known bugs and blockers
   - Last verified commands
4. Ensure the next agent can resume immediately without needing prior chat context.
