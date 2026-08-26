# Current State

Last updated: August 26, 2026

### Current milestone
Ntalo V2 — Phase 2 Realtime AI Voice Agent POC (Physical Android Acceptance Complete)

## Completed

- **Ntalo V2: Phase 2 — Realtime AI Voice Agent POC Complete:**
  - **Standalone Agent Worker (`agent/`):**
    - Node.js/TypeScript LiveKit Agent worker with pinned dependencies (`@livekit/agents@1.7.0`, `@livekit/agents-plugin-sarvam@1.7.0`, `@livekit/agents-plugin-openai@1.7.0`, `@livekit/agents-plugin-silero@1.7.0`).
    - Integrated Silero VAD for voice activity detection.
    - Integrated LiveKit `TurnDetector` for end-of-utterance and conversational turn detection.
    - Sarvam Saaras STT (`saaras:v3`, `en-IN`, streaming transcribe mode).
    - Sarvam 105B Conversations LLM (`sarvam-105b-conversations` via OpenAI-compatible endpoint).
    - Sarvam Bulbul TTS (`bulbul:v3`, `en-IN`, `shubh`, streaming progressive audio synthesis).
    - Internal worker authentication using `AGENT_INTERNAL_SECRET` (`Bearer <secret>`).
    - Enforced hard session deadline and server-authoritative finalization.
  - **Backend Voice Session & Atomic Entitlements (`backend/`):**
    - `POST /api/v1/voice/sessions`: Serialized atomic reservation, idempotency deduplication with caller ownership validation, LiveKit `AccessToken` generation with `RoomAgentDispatch` (`ntalo-voice-poc`).
    - `POST /api/v1/internal/voice-sessions/:id/active`: Internal endpoint to transition session to `ACTIVE` once user and agent are present.
    - `POST /api/v1/internal/voice-sessions/:id/complete`: Internal endpoint to finalize session and record `UsageLedger` row (`idempotencyKey: voice:<sessionId>`) exactly once.
    - Added `roomName String? @unique` to `VoiceSession` in Prisma schema with applied migration.
    - 115/115 backend unit and integration tests passing.
  - **Mobile Realtime WebRTC Client (`mobile/app/voice.tsx`):**
    - Live WebRTC room connection using `@livekit/react-native` and `livekit-client`.
    - Realtime agent state tracking (`Connecting...`, `Listening...`, `Speaking...`, `Thinking...`).
    - Live timer showing elapsed and quota seconds.
    - Microphone mute/unmute toggle.
    - `✕` exit button with graceful room and audio session teardown.
  - **Physical Android Runtime Acceptance (`9XPBUS7XM7CI6X9L`):**
    - Phone joins LiveKit room: PASS
    - Agent joins via RoomAgentDispatch: PASS
    - AI opening greeting delivered: PASS
    - Realtime speech recognition (Saaras v3): PASS
    - Conversational LLM turn generation (Sarvam 105B): PASS
    - Progressive streaming TTS (Bulbul v3): PASS
    - Conversational turns: PASS
    - Turn detection & basic barge-in: PASS
    - Mute/Unmute track toggle: PASS
    - `✕` exit button clean teardown: PASS
    - Automatic hard deadline enforcement: PASS
    - Backend lifecycle finalization & exact-once UsageLedger: PASS
    - Zero raw Ntalo audio persistence: PASS

- **Ntalo V2: Phase 0 & Phase 1 — Guest-First Architecture & P0/P1 Hardening:**
  - P0-1 Auth Merge Security Bypass Fixed.
  - P1-1 Atomic Single-Transaction Merge Claiming.
  - P1-2 Preserved Source Tombstone.
  - P1-3 Strict Installation ID Guest Entitlements.
  - P1-4 Dedicated Speaking Check & Snapshot Routing.
  - P1-5 Personalization Standalone Flow.

## Currently working on
Phase 2 Realtime AI Voice Agent POC Physical Acceptance Complete. Ready for Phase 3.

## Next exact task
1. Await user review of Phase 2 Physical Acceptance Report.
2. Next Phase: Phase 3 (Instant Peer Practice Matching & LiveKit Audio Call).

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
- `backend`: `npm test` (117 tests passing across 27 suites), `npx prisma validate`, `npx prisma migrate status`, `npm run typecheck`, `npm run lint`
- `agent`: `npm run typecheck`, `npm run lint`
- `mobile`: `npm run typecheck`, `npm run lint`
- `web`: `npm run typecheck`, `npm run lint`, `npm run build`


