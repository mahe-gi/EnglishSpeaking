# Core Development Rules (Always On)

## Before editing code
1. Read `@docs/PRD.md`.
2. Read `@docs/CURRENT_STATE.md`.
3. Inspect the files related to the requested task.
4. Inspect existing implementation before creating new implementation.
5. Check `git status`.
6. Determine the smallest implementation that satisfies the requirement.
7. Never assume something is missing before searching the repository.
8. Never create duplicate functionality.

## MVP Rule
This is an MVP. Prefer:
- simple
- boring
- clear
- typed
- testable
- replaceable

Avoid:
- microservices, event buses, CQRS, Redis, Kafka, message queues, provider factories, unnecessary repositories, unnecessary abstractions, premature optimization.

## Scope Rule
Do not add features merely because they appear useful. If the requested task is "Implement assessment recording", do NOT also implement streaks, achievements, new dashboards, push notifications, or social sharing.

## Modification Rule
Before creating something: **SEARCH FIRST**. Extend before duplicating.

## Dependency Rule
Do not add a dependency if the platform or existing dependency can solve the problem reasonably. State why it is required, verify it is maintained, and install the minimum necessary package. Never invent SDK methods.
