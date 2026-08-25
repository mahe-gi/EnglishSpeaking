---
name: implement-feature
description: Implement an approved Ntalo feature using existing architecture and complete validation/testing
---

# Implement Feature

This skill guides the implementation and verification of an approved feature slice.

## Procedure
1. **Confirm Requirements**: Ensure the exact requirement and boundaries are clear.
2. **Smallest Vertical Slice**: Implement route, controller, service, and UI components using existing patterns.
3. **Input Validation**: Validate all inputs at system boundaries with Zod.
4. **Error & Failure States**: Implement graceful failure handling, loading states, and error responses.
5. **Add Tests**: Write focused unit and integration tests covering happy path and key failure modes.
6. **Verification Chain**:
   - Run typechecks: `npm run typecheck`
   - Run linter: `npm run lint`
   - Run tests: `npm test`
7. **Review Execution**:
   - Execute `edge-case-review` skill.
   - If changes touch auth, APIs, database, uploads, peer communications, or credentials, execute `security-review` skill.
8. **Documentation**: Update `@docs/CURRENT_STATE.md` with the new state.
