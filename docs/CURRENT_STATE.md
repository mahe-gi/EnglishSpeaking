# Current State

Last updated: August 26, 2026

### Current milestone
Ntalo V2 — Production AI Fix & Complete Mobile UI/UX Design System Polish (Complete)

## Completed

- **1. Production AI Fix ("Talk with AI" / LiveKit Agent Worker):**
  - **Worker Dependency Resolution (`agent/package.json`):** Moved `tsx` and `typescript` from `devDependencies` to `dependencies` so production builds (`npm install --omit=dev`) contain runtime executables.
  - **Containerized Agent (`agent/Dockerfile`):** Added production Dockerfile based on `node:22-bookworm-slim` for consistent container deployment in DigitalOcean.
  - **LiveKit Agent Dispatch Contract:** Explicit dispatch on `agentName: "ntalo-voice-poc"` aligned across backend, worker, and LiveKit Cloud.
  - **AI Voice Call Screen Resilience (`mobile/app/voice.tsx`):** Added explicit 18s connection timeout, participant join detection, and graceful fallback UI.

- **2. Coherent Ntalo Design System (`mobile/theme/` & `mobile/components/`):**
  - **Design Tokens:** Defined semantic tokens for `colors` (slate/zinc palette, brand accent #2563EB, status colors), `typography` (inter-scale with explicit lineHeight and fontWeights), `spacing` (4px grid), `radius` (4px to full), and `shadows`.
  - **Component Primitives:** Implemented accessible, reusable primitives: `AppText`, `Button`, `IconButton`, `StatusBadge`, `Card`, `Screen`.

- **3. Complete Removal of Emojis & Replacement with Vector Icons:**
  - **Emoji Audit:** Ran comprehensive AST/regex audit across all `.ts`/`.tsx` files in `mobile/app` and `mobile/components`. Total emojis found: **0**.
  - **Vector Icons:** Standardized on `@expo/vector-icons` (`Ionicons`) with consistent sizing, colors, and accessibility attributes.

- **4. Screen-by-Screen UI/UX Polish:**
  - **Tabs Layout (`(tabs)/_layout.tsx`):** Tab bar icons replaced with active/inactive vector icons and clean typography.
  - **Home Screen (`(tabs)/index.tsx`):** Redesigned hero card, dual primary actions (AI Voice practice & Peer practice), clear guest/registered status, and polished modal dialogs.
  - **AI Voice Call Screen (`voice.tsx`):** Ambient breathing voice orb with Reanimated, real-time connection states, vector controls (mute, end call), and connection timeout fallback.
  - **Peer Matchmaking Screen (`(peer)/index.tsx`):** Pulsing search radar, clear 45s search TTL, instant retry, and fallback to AI practice.
  - **Peer Call Screen (`(peer)/session.tsx`):** Live timer, clean partner avatar, mute/end actions, and comprehensive Safety & Moderation modal.
  - **Progress Tab (`(tabs)/progress.tsx` & `(progress)/index.tsx`):** Structured practice stats, baseline snapshot cards, WPM/filler metrics, and history list.
  - **Profile Screen (`(tabs)/profile.tsx`):** Clean user avatar, subscription/plan badges, settings list with chevrons, and confirmation modals.
  - **Speaking Check & Personalization (`speaking-check.tsx`, `personalize.tsx`):** Form controls with radio states, language chips, and clean modal dialogs.
  - **Daily Practice (`(practice)/index.tsx`) & Assessment (`(assessment)/index.tsx`):** Clean audio recording controls, model answer suggestions, and coaching feedback cards.

- **5. Phase 3 Instant Peer Practice Matching & Realtime WebRTC Calls:**
  - Serialized matchmaking queue, authoritative LiveKit webhooks, 0-second unbilled cancellations, safety reporting, and two-user physical Android test verification.

## Currently working on
Production AI Fix and Mobile UI/UX polish completed and verified.

## Next exact task
1. Trigger mobile preview build / test on physical device.
2. Monitor production agent worker on DigitalOcean with LiveKit Cloud.

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
- Product UI is strictly emoji-free; all graphical indicators use `@expo/vector-icons` (`Ionicons`).
- Agent internal API endpoints require `AGENT_INTERNAL_SECRET` header validation.
- Mobile client tracks remote Agent participant presence before transitioning AI voice call to active state.

## Files changed recently
- `agent/package.json`
- `agent/Dockerfile`
- `mobile/theme/*` (`colors.ts`, `typography.ts`, `spacing.ts`, `radius.ts`, `shadows.ts`, `index.ts`)
- `mobile/components/*` (`AppText.tsx`, `Button.tsx`, `IconButton.tsx`, `StatusBadge.tsx`, `Card.tsx`, `Screen.tsx`)
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/app/(tabs)/index.tsx`
- `mobile/app/(tabs)/progress.tsx`
- `mobile/app/(tabs)/profile.tsx`
- `mobile/app/voice.tsx`
- `mobile/app/(peer)/index.tsx`
- `mobile/app/(peer)/session.tsx`
- `mobile/app/speaking-check.tsx`
- `mobile/app/personalize.tsx`
- `mobile/app/(practice)/index.tsx`
- `mobile/app/(assessment)/index.tsx`
- `mobile/app/(progress)/index.tsx`
- `docs/CURRENT_STATE.md`

## Last verified commands
- `backend`: `npm test` (124 tests passing across 28 suites), `npm run typecheck`, `npm run lint`
- `agent`: `npm run typecheck`, `npm run lint`
- `mobile`: `npx tsc --noEmit` (0 errors), AST emoji audit (0 emojis found)
- `db`: `npx prisma migrate status` (Database schema up to date)



