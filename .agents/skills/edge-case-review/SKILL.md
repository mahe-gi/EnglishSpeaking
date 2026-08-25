---
name: edge-case-review
description: Review recently implemented Ntalo functionality for failures involving inputs, state, network, concurrency, providers, security and recovery
---

# Edge-Case Review

This skill performs a rigorous failure mode audit on recently implemented functionality against `@docs/EDGE_CASES.md`.

## Procedure
1. Inspect the recent code changes.
2. Systematically evaluate the following 12 failure categories:
   - **INPUT**: Malformed payloads, invalid types, boundary values, empty inputs.
   - **STATE**: App backgrounded, unmounted screens, expired tokens, uninitialized profile.
   - **NETWORK**: Timeout, offline state, connection drops mid-request/upload.
   - **AUTH & AUTHORIZATION**: Unauthenticated access, expired token, IDOR / resource ownership checks.
   - **CONCURRENCY & IDEMPOTENCY**: Rapid double-tap, duplicate submissions, conflicting matches.
   - **EXTERNAL PROVIDERS**: Sarvam STT/LLM timeout, rate limit, malformed JSON, LiveKit room failure.
   - **DATABASE**: Unique constraint violation, transaction rollback, connection pool exhaustion.
   - **RETRY**: Safe idempotent retry without data duplication or state corruption.
   - **MOBILE LIFECYCLE**: Audio interruption, permission denial, keyboard overlap, text scaling.
   - **ACCESSIBILITY**: Touch targets, text contrast, dynamic font scaling, visual feedback.
   - **PRIVACY**: Zero-day raw audio retention, sanitized server logs, secure credentials.
   - **UX RECOVERY**: User-facing error messaging, retry button, non-blocking UI.
3. For each identified failure mode, classify:
   - `Handled`: Already protected in code.
   - `Test Required`: Needs automated test verification.
   - `Must Fix Before Merge`: High-impact blocker.
   - `Acceptable MVP Limitation`: Documented lower-priority edge case.
