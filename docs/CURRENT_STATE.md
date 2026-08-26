# Current State

Last updated: August 26, 2026

### Current milestone
Ntalo V2 — Phase 3 Instant Peer Practice Matching (Physical Runtime Acceptance Complete)

## Completed

- **Ntalo V2: Phase 3 — Instant Peer Practice Matching & Realtime WebRTC Calls Complete:**
  - **Matchmaking Engine & SERIALIZABLE Transactions (`backend/src/modules/peer/`):**
    - `POST /api/v1/peer/matchmaking/join`: Atomic `SERIALIZABLE` queue pairing engine preventing duplicate matches, self-pairing, and race conditions.
    - Strict Registered User + 18+ Age Confirmation guards.
    - Quota-aware duration negotiation: `allowedSeconds = min(remainingA, remainingB, 900)`.
    - Directional blocking and bidirectional rematch prevention ($A \rightarrow B$ or $B \rightarrow A$).
    - Match-scoped opaque participant tokens (`peer_<matchId>_a`, `peer_<matchId>_b`).
    - 45s search TTL with clean status reporting (`SEARCHING`, `MATCHED`, `TIMEOUT`, `CANCELLED`).
  - **Authoritative LiveKit Webhooks & Usage Settlement (`backend/src/modules/peer/`):**
    - Raw-body middleware with verified `WebhookReceiver` cryptographic signature check.
    - Single participant connect remains `MATCHED` (`startedAt = null`, `deadlineAt = null`, no billing).
    - Transition to `ACTIVE` with server `startedAt` occurs strictly when both participants connect.
    - Webhook idempotency: repeated delivery preserves original `startedAt`.
    - Single participant unbilled exit: transitions to `CANCELLED` with 0 billed seconds and 0 ledger rows.
    - Session leave: server transitions to `COMPLETED`, setting `endedAt`, calculating `actualSeconds`, and creating exactly TWO `UsageLedger` rows with `idempotencyKey = peer:<matchId>:<userId>`.
  - **Moderation & Safety (`reports` & `blocks`):**
    - `POST /api/v1/peer/matches/:id/report`: Server resolves `reportedUserId` from match. Report alone does not block.
    - `POST /api/v1/peer/matches/:id/block`: Directional block created, immediately terminating rematchability.
  - **Mobile Peer Practice Experience (`mobile/app/(peer)/`):**
    - Matchmaking radar & search timeout screen with retry & AI fallback.
    - Realtime WebRTC audio call screen via `@livekit/react-native` and `livekit-client`.
    - Connection states: `Connecting...`, `Waiting for partner...`, `Live Call`, `Partner disconnected`.
    - Live countdown timer, microphone mute/unmute, Safety & Moderation modal, and End Call.
  - **Two-User Physical Android Acceptance (`9XPBUS7XM7CI6X9L` + Second Client):**
    - User A (physical Android) joins queue $\rightarrow$ `SEARCHING`: PASS
    - User B joins $\rightarrow$ atomic pairing into single `PeerMatch`: PASS
    - Single participant waiting $\rightarrow$ `MATCHED`, `startedAt = null`, no billing: PASS
    - Second participant connects $\rightarrow$ genuine WebRTC activation $\rightarrow$ `ACTIVE`: PASS
    - Live bidirectional audio exchange: PASS
    - Mute/Unmute microphone toggle: PASS
    - Report partner $\rightarrow$ server-resolved Report row without block: PASS
    - Block partner $\rightarrow$ Block row created and rematch blocked in both directions: PASS
    - Leave call $\rightarrow$ `COMPLETED`, exact duration, and 2 `UsageLedger` rows: PASS
    - 124/124 backend tests passing, 0 TypeScript errors across backend & mobile.


- **Ntalo V2: Phase 0 & Phase 1 — Guest-First Architecture & P0/P1 Hardening:**
  - P0-1 Auth Merge Security Bypass Fixed.
  - P1-1 Atomic Single-Transaction Merge Claiming.
  - P1-2 Preserved Source Tombstone.
  - P1-3 Strict Installation ID Guest Entitlements.
  - P1-4 Dedicated Speaking Check & Snapshot Routing.
  - P1-5 Personalization Standalone Flow.

## Currently working on
Phase 3 Instant Peer Practice Matching Physical Acceptance Complete. Ready for Phase 4 (Progress, Feedback & Profile).

## Next exact task
1. Await user review of Phase 3 Two-User Physical Acceptance Report.
2. Begin Phase 4: Progress, Practice History & Profile Insights.


Do not implement:
- LiveKit video calls, screen sharing, group calls
- Microservices, Redis, Kafka
- AI avatars, social feeds, public profiles, DMs, followers
- Badges, coins, gamification leaderboards

## Known bugs
None.

## Blockers
None.

## Important decisions
- Target identity for `completeMerge` requires verified `google.com` provider from Firebase Admin claims.
- Guest trial limit (120s) is scoped strictly to persistent UUID `installationId`.
- Timezone boundaries computed in `Asia/Kolkata` (UTC+5:30).
- No mandatory onboarding questionnaire or mandatory baseline assessment gate on startup.
- Ntalo does not intentionally persist raw realtime AI audio on mobile, backend storage, PostgreSQL, or Ntalo object storage. Audio is streamed through LiveKit/Sarvam for realtime processing.

## Files changed recently
- `agent/src/agent.ts`
- `agent/src/backend-client.ts`
- `agent/src/prompt.ts`
- `backend/prisma/schema.prisma`
- `backend/src/modules/users/entitlement.service.ts`
- `backend/src/modules/voice/voice.service.ts`
- `backend/src/modules/voice/voice.controller.ts`
- `backend/src/modules/voice/voice.route.ts`
- `backend/tests/voice.test.ts`
- `mobile/app/voice.tsx`
- `mobile/lib/api.ts`
- `docs/CURRENT_STATE.md`

## Last verified commands
- `backend`: `npm test` (124 tests passing across 28 suites), `npx prisma validate`, `npx prisma migrate status`, `npm run typecheck`, `npm run lint`
- `agent`: `npm run typecheck`, `npm run lint`
- `mobile`: `npm run typecheck`, `npm run lint`
- `web`: `npm run typecheck`, `npm run lint`, `npm run build`


