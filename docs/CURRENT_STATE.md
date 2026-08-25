# Current State

Last updated: August 25, 2026

### Current milestone
Phase 5 — Scheduled Peer Practice (Implementation Complete; Native Runtime Smoke Test Pending)

## Completed
- **Phase 0 — Foundation & Authentication:**
  - Native Google Sign-In with `react-native-nitro-google-signin` and `expo-dev-client`.
  - Firebase JS SDK (`firebase/auth`) with `@react-native-async-storage/async-storage` persistence.
  - Fail-fast environment validation using `requireEnv` helper.
  - Server-side cryptographic token verification using `firebase-admin`.
  - Idempotent `PUT /api/v1/me` returning user data, `onboardingCompleted`, `assessmentCompleted`, and `baselineAssessmentId`.
  - Session restoration on app start via `onAuthStateChanged`.
- **Phase 1 — Onboarding Profile Flow:**
  - Single-route 4-step onboarding flow in `mobile/app/(onboarding)/index.tsx` using local state.
  - Protected backend endpoint `PUT /api/v1/onboarding` with strict Zod schema validation.
  - Idempotent PostgreSQL `Profile` upsert linked to authenticated `User.id`.
  - Onboarding CTA displays "Retry" on submission failure.
  - Navigation routing: un-onboarded users are directed to `/(onboarding)`; onboarded users land on verified product view.
  - Comprehensive automated tests including repeated PUT profile updates.
- **Phase 2 — Baseline Speaking Assessment (Architecture & Implementation Complete):**
  - **Prisma Migrations Structure Repaired:**
    - Baseline `0_init/migration.sql` accurately reflects all models in `schema.prisma` (`users` with `name`/`avatarUrl`, `profiles` with JSON `weaknesses`, `practice_sessions`, `utterances`, `peer_availabilities`, `peer_matches`, `reports`, `blocks`).
    - Incremental `20260825_add_utterance_session_sequence_unique/migration.sql` adds only the Phase-2 delta (`ALTER TYPE "SessionStatus" ADD VALUE 'ANALYZING';`, `ALTER TABLE "practice_sessions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`, `CREATE UNIQUE INDEX "utterances_sessionId_sequence_key" ON "utterances"("sessionId", "sequence");`).
  - **Recording & Playback:** Native audio recording via `expo-audio` with 30s auto-stop, separated `finalizeStoppedRecording` from `stopRecordingManually` (eliminating double-stop races), <1s rejection, non-empty URI validation, and device TTS (`expo-speech`).
  - **Upload & STT Pipeline:** In-memory multer audio upload (10MB limit), strict Zod integer parsing (`StrictIntegerSchema`), Sarvam Saaras STT (`saaras:v4` verbatim, 15s timeout, empty transcript rejection). Zero-retention local audio deletion on phone via modern Expo SDK 57 `File.delete()` immediately upon server confirmation. Answer locking to prevent redundant uploads.
  - **Deterministic Metrics + Sarvam 105B Rubric + Baseline Report:**
    - Unicode-aware metrics tokenizer (`\p{L}\p{N}\p{M}`) handling English contractions (`I'm`, `don't`) and Indic scripts without splitting vowel matras.
    - High-confidence Indian English filler detection (`um`, `umm`, `uh`, `uhh`, `er`, `erm`), avoiding false positives on legitimate words (*like*, *actually*, *so*).
    - Delivery / Fluency sub-score (0-100) calculated deterministically from WPM (ideal 110-150) and filler percentage.
    - Sarvam 105B structured rubric evaluation (`POST /v1/chat/completions`, `reasoning_effort: null`, prompt injection security headers, JSON schema output validated with Zod).
    - Backend-owned weighted scoring formula (Delivery 25%, Grammar 20%, Structure 20%, Vocabulary 15%, Communication 15%, Relevance 5%) producing overall score 1-100 without LLM hallucinations.
    - Atomic concurrency claim (`IN_PROGRESS` → `ANALYZING` → `COMPLETED`) with comprehensive failure recovery (reverts to `IN_PROGRESS` on any evaluator, metric, or DB transaction failure) and stale claim auto-recovery (> 2 minutes) for process-crash resilience.
    - Required version metadata schema validation (`baseline-v1`, `speech-metrics-v1`, `assessment-rubric-v1`, `saaras:v4`, `sarvam-105b`), rejecting corrupt stored reports with `500 ASSESSMENT_REPORT_INVALID`.
    - Atomic increment for `Profile.totalSpeakingSeconds`.
    - Mobile Baseline Assessment Report UI displaying overall score, 6-dimension breakdown grid, speech metrics, strengths, and 3 actionable improvement areas. Mobile handling of `ANALYZING` state with progress indicator and recovery.
- **Phase 3 — Daily Practice Vertical Slice (Job Interview English Complete):**
  - **Scenario Catalog & Selection:** 12 hardcoded Job Interview scenarios (`backend/src/modules/practice/practice-scenarios.ts`) matching learner career status (`COLLEGE_STUDENT`, `JOB_SEEKER`, `WORKING_PROFESSIONAL`) and avoiding immediate repeats.
  - **Server-Owned Turn Ordering & Questions:** Strict 3-turn sequence progression (`0 turns → 1`, `1 turn → 2`, `2 turns → 3`, `3 turns → COMPLETED`). Rejects out-of-order calls with `409 INVALID_PRACTICE_SEQUENCE`. Questions resolved authoritatively from scenario initial question (Turn 1) and persisted follow-up questions (Turns 2 and 3).
  - **Staged Provider Cost Idempotency:**
    - Full Idempotency: Retrying a completed turn returns stored feedback without calling STT or LLM.
    - Staged Recovery: If STT succeeded but LLM failed previously, STT is skipped and only LLM is invoked on retry.
    - Fresh Turn: STT transcribes verbatim (`saaras:v4`), persists transcript and metrics FIRST, then invokes Sarvam 105B.
  - **Single Structured LLM Call Per Turn:**
    - Single call to Sarvam 105B with prompt injection defense, validated with Zod `PracticeTurnFeedbackSchema`.
    - Turns 1 & 2 enforce non-empty `followUpQuestion` and `sessionSummary = null`.
    - Turn 3 enforces `followUpQuestion = null` and includes `sessionSummary` (`strength` and `nextPracticeSuggestion`) using concise context from all 3 turns (zero 4th LLM calls).
  - **Turn-3 Transactional Finalization:** Inside a single Prisma transaction, transitions `PracticeSession` to `COMPLETED`, records `completedAt`, and atomically increments `Profile.totalSpeakingSeconds`.
  - **Start / Resume Capabilities:** `POST /api/v1/practice/sessions` checks for active in-progress sessions and resumes at the authoritative next turn without resetting to question 1.
  - **Mobile Daily Practice Experience:**
    - Route `mobile/app/(practice)/index.tsx` with explicit state machine (`loading`, `ready`, `recording`, `recorded`, `processing`, `feedback`, `completed`, `error`, `permissionRequired`).
    - TTS audio question playback (`expo-speech`), native 30s recording (`expo-audio`), zero-retention client cache deletion via Expo SDK 57 `File.delete()`.
    - Rich coaching feedback view (coach observation, up to 3 grammar corrections, clearly labeled "Better version", focus area tag, fluency metrics).
    - Session summary view with aggregate speaking time, avg WPM, filler word count, standout strength, and next practice focus.
  - All 66 backend tests passing across 16 suites.

- **Phase 4 — Minimal Progress Tracking:**
  - `GET /api/v1/progress` endpoint querying PostgreSQL `Profile`, baseline `PracticeSession`, and completed `AI_PRACTICE` sessions.
  - Fluency comparison: Weighted recent WPM (`totalRecentWords / totalRecentMinutes`) and filler rate (`baselineFillerPercentage` vs `recentFillerPercentage`).
  - Frequency breakdown of coaching focus areas (`GRAMMAR`, `STRUCTURE`, `VOCABULARY`, `CLARITY`, `DELIVERY`, `RELEVANCE`) with resilient parsing of historical records.
  - Lifetime speaking time computed with `prisma.utterance.aggregate` over all completed `AI_PRACTICE` utterances.
  - Recent sessions history list with dates, scenarios, speaking duration, WPM, and primary focus tag.
  - Mobile progress screen (`mobile/app/(progress)/index.tsx`) with stat cards, comparison pills, focus distribution bars, and recent history.
  - All 74 backend tests passing across 17 test suites.

- **Phase 5 — Scheduled Peer Practice / LiveKit Audio Transport (Implementation Complete):**
  - **Fixed Evening Slot Scheduling:** Typed IST-oriented evening slot catalog (4 slots/day) with UTC ISO timestamp conversion and exact catalog membership validation.
  - **Database Invariant & Migration:** Added `@@unique([userId, startsAt])` on `PeerAvailability` via migration `20260825_add_peer_availability_user_starts_at_unique`.
  - **Serializable Matching Transaction:** Concurrent atomic matching with bounded retry (P2034/claim collision), bidirectional `Block` checking, ranking (career status match, baseline score proximity, oldest availability), and deterministic Learner A/B role assignment.
  - **Atomic Conditional Cancellation:** `cancelAvailability` uses conditional `updateMany` (`where: { status: 'AVAILABLE' }`) to eliminate race conditions against concurrent matching.
  - **LiveKit Cloud Micro-Permissions & Privacy:** Authenticated endpoint `POST /api/v1/peer/matches/:id/token` enforcing 5-minute pre-window to 10-minute post-window, returning match-scoped opaque identifiers (`peer_<matchId>_a` / `peer_<matchId>_b`), room `peer_<matchId>`, microphone-only publishing grant (`TrackSource.MICROPHONE`), `canPublishData: false`, and zero PII.
  - **Safety & Moderation Actions:** Idempotent `POST /api/v1/peer/matches/:id/report` (predefined categories) and `POST /api/v1/peer/matches/:id/block` (bidirectional matching exclusion).
  - **Shared PeerMatch Completion Semantics:** Disconnecting before scheduled session end leaves shared match active for partner; at/after 15 minutes, idempotently finalizes to `COMPLETED`.
  - **Mobile 1:1 Audio Experience:** Routes `mobile/app/(peer)/index.tsx` and `mobile/app/(peer)/session.tsx`, module-level `registerGlobals()`, `isAdultConfirmed` explicit default `false`, `AudioSession.startAudioSession()` on join and `AudioSession.stopAudioSession()` on leave, 15-minute 4-stage agenda timer (Intro, Learner A, Learner B, Wrap-up), mute/unmute, leave call, safety modal, and private post-session reflection.
  - All 92 backend tests passing across 23 test suites.

## Currently working on
Phase 5 Real Two-Device Native Development Build Smoke Test & Closed Beta Preparation.

## Next exact task
1. Execute the 2-device LiveKit Development Build smoke test checklist.
2. Confirm two-way audio, presence, mute/unmute, reconnection, and leave cleanup on physical devices.
3. Upon smoke test signoff, finalize Closed Beta Preparation.

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
- Node runtime pinned to `22.23.1` (matching Expo SDK 57 EAS build environment).
- Expo Development Build (`expo-dev-client`) is required starting in Phase 0.
- Daily practice turns do not assign 1-100 scores; they provide deterministic fluency metrics, structured coaching, and better versions.
- Exactly 3 speaking turns per daily practice session.
- Staged provider idempotency prevents duplicate billing for STT or LLM upon retries.
- Client audio cache is deleted immediately after server response confirmation.
- Progress metrics compare weighted rates (WPM and filler percentage), not raw counts or fake synthetic scores.
- Peer practice audio flows exclusively between device and LiveKit Cloud via WebRTC with zero server storage/transcription.
- LiveKit participant identities and room names are strictly opaque match-scoped identifiers with zero PII.

## Files changed recently
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260825_add_peer_availability_user_starts_at_unique/migration.sql`
- `backend/src/services/livekit.service.ts`
- `backend/src/modules/peer/peer-slots.ts`
- `backend/src/modules/peer/peer.service.ts`
- `backend/src/modules/peer/peer.controller.ts`
- `backend/src/modules/peer/peer.route.ts`
- `backend/src/app.ts`
- `backend/tests/peer.test.ts`
- `mobile/app/_layout.tsx`
- `mobile/lib/api.ts`
- `mobile/app/(peer)/index.tsx`
- `mobile/app/(peer)/session.tsx`
- `mobile/app/index.tsx`
- `docs/CURRENT_STATE.md`

## Environment setup
See `backend/.env.example`, `mobile/.env.example`, and `web/.env.example`.

## Last verified commands
- `backend`: `npx prisma validate && npm run typecheck && npm run lint && npm test` (92 tests passing across 23 suites)
- `mobile`: `npx expo-doctor && npm run typecheck && npm run lint` (21 checks passing, 0 errors, 0 warnings)
- `web`: `npm run lint && npm run typecheck && npm run build` (Next.js build passing)
