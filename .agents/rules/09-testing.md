# Testing Rules
<!-- description: Apply when writing tests, verifying features, reviewing test coverage, and validating acceptance criteria. -->

## Definition of Tested
A feature is complete only when:
- Happy path works as expected.
- Known failure states and edge cases are handled.
- TypeScript passes strictly without errors or `any` workarounds.
- Linter passes with zero warnings/errors.
- Unit and integration tests pass.

## Required Test Layers
- Backend: Unit tests for core services (scoring calculation, metric extraction, prompt schema parsing) and integration tests for route handlers (auth verification, input validation, health check).
- Mobile: Component smoke tests and critical hook verification.
- Do not write meaningless tests purely to inflate code coverage numbers.
