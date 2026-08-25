---
name: plan-feature
description: Plan a Ntalo feature before implementation, including scope, non-scope, acceptance criteria and edge cases
---

# Plan Feature

This skill produces a minimal, structured implementation plan for a requested feature.

## Procedure
1. Review the relevant sections in `@docs/PRD.md`.
2. Inspect existing codebase patterns to extend existing code before creating new files.
3. Define:
   - **User Outcome**: The visible, testable user capability.
   - **Scope**: Minimum necessary changes.
   - **Explicit Non-Scope**: What will NOT be built.
   - **API & Data Impact**: Schema updates, endpoints, payload formats.
   - **Edge Cases**: Relevant entries from `@docs/EDGE_CASES.md`.
   - **Acceptance Criteria**: Concrete criteria that define feature completion.
   - **Verification Strategy**: Specific tests, typechecks, and manual validation steps.
4. Stop and obtain approval if the plan introduces new dependencies or architectural changes.
