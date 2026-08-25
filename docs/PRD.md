# Ntalo — MVP Product Requirements Document

**Version:** 1.0  
**Date:** August 25, 2026  
**Status:** Ready for implementation  
**Primary platform:** Android/iOS mobile app  
**Future platform:** Web app using the same backend  
**Initial market:** India  
**Initial use case:** Spoken English for job interviews and workplace communication  

---

# 1. Product Summary

Ntalo is a mobile-first spoken-English practice product for Indian students, job seekers, developers, recent graduates, and early-career professionals who already understand English but struggle to speak fluently and confidently in real situations.

The product is not an English course.
It is not focused on memorizing grammar rules, vocabulary, lessons, or quizzes.
The product focuses on one measurable behavior:

> **Speak more clearly and confidently in job interviews and workplace conversations.**

The core learning loop is:
```text
ASSESS
   ↓
PRACTICE WITH AI
   ↓
GET SPECIFIC FEEDBACK
   ↓
PRACTICE AGAIN
   ↓
SPEAK WITH A REAL LEARNER
   ↓
TRACK IMPROVEMENT
```

The central product thesis is:
> AI gives users unlimited structured practice. Human peer sessions test whether the user can transfer that improvement into a real conversation.

---

# 2. The Problem

A large group of learners in India do not primarily have a comprehension problem.
They can read English, understand English videos, write basic English, and follow technical discussions. But they struggle when they need to speak immediately.

Typical problems include:
* long pauses
* filler words
* restarting sentences
* poor response structure
* knowing an answer but being unable to explain it
* translating mentally before speaking
* fear of making grammatical mistakes
* difficulty explaining technical projects
* difficulty answering interview questions
* lack of regular real speaking practice

Existing loop:
```text
Learn grammar → Watch English videos → Read vocabulary → Understand more English → Still hesitate when speaking
```

Our product changes the loop to:
```text
Speak → Get feedback → Speak again → Measure improvement
```

---

# 3. Primary Target User

**18–30-year-old Indian college students, graduates, job seekers and early-career professionals who understand English but struggle with spoken communication.**

Primary initial segments:
* engineering students
* final-year students
* recent graduates
* junior software engineers
* SDE candidates
* startup employees
* job seekers
* professionals preparing for interviews

First learning track: **Job Interview English**  
Secondary future track: **Workplace English** (do not build deeply during MVP)

---

# 4. Product Positioning

Position around structured outcome:
> **Practice speaking for interviews and work. Get measurable feedback every day.**

Do not position as "AI English teacher", "Learn English using AI", or "Meet strangers and practice English".

---

# 5. MVP Question

> Will users repeatedly spend 10–15 minutes speaking inside the product because they believe their real communication is improving?

---

# 6. MVP North-Star Metric

Primary metric: **Meaningful speaking minutes per active user per week**

Supporting metrics:
* AI practice sessions per user per week
* Day-1 retention / Day-7 retention
* assessment completion
* speaking minutes
* peer-session participation & completion
* score improvement & filler-rate improvement
* user-reported confidence
* cost per completed practice session

---

# 7. Internal Validation Thresholds (20–30 User Beta)
* Baseline assessment completion ≥ 70%
* Users completing 3+ AI sessions ≥ 60%
* Day-7 active users ≥ 30%
* Users trying peer practice ≥ 40%
* Completed matched peer sessions ≥ 70%

---

# 8. Core MVP Capabilities
1. Authentication + onboarding
2. Baseline speaking assessment
3. Daily structured AI practice
4. Speaking feedback and scoring
5. Progress tracking
6. Scheduled one-to-one peer practice

---

# 9. Explicit Non-Goals
Do not build: social feed, followers, public profiles, DMs, group calls, video calls, tutor marketplace, teacher dashboard, IELTS/TOEFL, pronunciation/phoneme coaching, accent reduction, grammar course, vocabulary flashcards, certificates, leaderboards, coins/XP, badges, AI avatars, 3D characters, multiple spoken languages.

---

# 10. User Journey
Install app → Continue with Google → Onboarding → Baseline speaking assessment → Initial speaking score → Personal weakness profile → Today\'s 10-minute practice → Feedback → Progress updated → Return tomorrow → Scheduled peer practice → Continue personalized practice.

---

# 11. Authentication
- Initial signup: **Continue with Google** only (no email/password signup form).
- Backend verifies Firebase ID tokens via `firebase-admin`.

---

# 12. Password Creation After Google Signup
- After Google signup, user can create a password in Settings.
- Links email/password credential to the same Firebase user keeping the same Firebase UID.
- No separate password database in PostgreSQL.

---

# 13. Firebase Account-Linking Requirement
- Verify `linkWithCredential()` behavior.
- Retain one Firebase UID; never create duplicate application users.

---

# 14. Firebase Usage Boundary
Firebase used ONLY for: Auth, Google OAuth, linked password, password reset, ID tokens (optional later: Crashlytics, FCM).  
NOT used for: Database, Firestore, Storage, Cloud Functions, backend logic.

---

# 15. Authentication States
- State A: Logged out (Minimal screen with "Continue with Google" & "Use email & password")
- State B: Authenticated, onboarding incomplete → redirect to onboarding
- State C: Onboarding complete, assessment incomplete → redirect to baseline assessment
- State D: Active user → redirect to home

---

# 16. Onboarding (< 1 minute)
- Screen 1: Current situation (College student / Job seeker / Working professional)
- Screen 2: Goal (Job interviews / Workplace conversations / Speaking confidence)
- Screen 3: Native language (Hindi / Telugu / Tamil / Kannada / Malayalam / Marathi / Bengali / Other)
- Screen 4: Confidence (1-5 rating)
- Final screen: CTA to start 5-minute speaking assessment

---

# 17. Baseline Assessment (3–5 minutes)
Prompts:
1. "Tell me about yourself."
2. "Tell me about a project or something you recently worked on."
3. "Imagine you missed a deadline. Explain the situation to your manager."
Target answers: ~20–30 seconds each.

---

# 18. Recording UX
- Flow: Question → Tap record → Speak → Stop → Transcribe → Next
- Maximum answer duration: 30 seconds.
- Uses `expo-audio` for recording in React Native / Expo.

---

# 19. Speech-to-Text
- Primary STT: **Sarvam Saaras** (`saaras:v4`, fallback `saaras:v3`).
- Mode: `verbatim` to preserve fillers (`umm`, `uh`, `actually`, `basically`, `like`, `you know`).

---

# 20. STT Cost
- ₹30/hour billed per second (~₹2.50 per 5 min speaking session). Audio duration recorded for cost tracking.

---

# 21. Daily AI Practice (~10 min)
- Deterministic topics with topic, goal, focus skill, questions, completion state, feedback.

---

# 22. Initial Seven-Day Track
- Day 1: Baseline assessment
- Day 2: Tell me about yourself (concise intro, logical structure)
- Day 3: Explain a project (Problem, Responsibility, Solution, Result)
- Day 4: Strengths and weaknesses (specificity, examples)
- Day 5: Behavioral question (STAR/PAR structure)
- Day 6: Technical communication (clarity, avoiding jargon)
- Day 7: Peer mock interview

---

# 23. AI Practice Session Flow
Start session → AI question → User records response → Sarvam STT → Transcript saved → LLM decides follow-up → Next question (5–8 turns) → Session complete → Generate report.

---

# 24. TTS
- AI questions use device-native TTS (`expo-speech`). Question text always displayed on screen.

---

# 25. LLM
- Initial model: `sarvam-105b` (or Sarvam chat completions).

---

# 26. AI Responsibilities & 27. Deterministic Metrics
- LLM evaluates: grammar, coherence, vocabulary appropriateness, response structure, answer relevance, communication effectiveness (0-100 each).
- Application code deterministically calculates: audio duration, word count, WPM, filler count/frequency, repeated filler phrases.

---

# 28. Timestamp Metrics
- Sarvam chunk-level timestamps used for response duration & gap analysis; no fake word-level precision.

---

# 29–30. LLM Output Contract
- Validated with Zod against strict JSON schema. Retry once on failure, then fallback to safe generic feedback.

---

# 31. Speaking Score Formula
- Fluency / delivery: 25%
- Grammar: 20%
- Response structure: 20%
- Vocabulary: 15%
- Communication: 15%
- Relevance: 5%
Calculated in backend code (not arbitrary LLM number).

---

# 32–36. Feedback UX, Weakness Profile & Progress
- Concise feedback (Score, dimension breakdown, main focus, repeated fillers, next exercise).
- Persistent weakness profile in JSONB.
- Progress screen: Day 1 score vs Today vs Target, weekly speaking time, filler rate trends.

---

# 37–38. Navigation & Home Screen
- 4 Tabs: Home, Practice, Progress, Profile.
- Home shows: Today\'s practice, current score, next peer session.

---

# 39–47. Peer Practice (Scheduled 1-to-1)
- Scheduled 15-minute slots (7:00, 7:30, 8:00, 8:30 PM).
- Structure: 1 min intro → 6 min Learner A → 6 min Learner B (role reversal) → 2 min wrap-up.
- Audio transport: **LiveKit Cloud**. Express manages matching, room creation, and token generation.
- **Note on LiveKit in Expo:** Native WebRTC requires migrating from Expo Go to Expo Development Build (`expo-dev-client`) during Phase 5.
- Peer safety controls: Mute, Leave, Report, Block (all reachable during call).

---

# 48. Profile & Settings
Minimal: Name, Email, Goal, Native language, Level, Create/change password, Reset password, Notification settings, Blocked users, Delete account, Sign out.

---

# 49–55. UI & Design Direction
- Inter font, clean, typography-led, minimal copy, design tokens for color, React Native Reanimated for animations.

---

# 56–58. Landing Page
- Next.js, TypeScript, Tailwind CSS, GSAP. Short, outcome-focused copy and mobile previews.

---

# 59–79. Technical Architecture
- **Architecture:** Modular Monolith (Node.js + Express 5 + TypeScript + PostgreSQL + Prisma).
- **Client independence:** Backend APIs are client-neutral (`/api/v1/*`).
- **Database (Neon PostgreSQL):** Users, Profiles, PracticeSessions, Utterances, PeerAvailabilities, PeerMatches, Reports, Blocks.
- **Audio Privacy:** Default 0-day raw audio retention (deleted after transcription).

---

# 80–90. Deployment, Security & Testing
- Backend: Dockerized Node/Express on Render/Railway.
- Database: Neon PostgreSQL.
- Auth: Firebase Admin token verification on every protected route.
- Input validation: Zod on all endpoints.

---

# 91–96. Acceptance Criteria
See complete criteria for Auth, Assessment, Daily Practice, Progress, Peer Practice, and Design in PRD specs.

---

# 97–103. MVP Build Order
- **Phase 0 — Foundation & Authentication**: Project scaffolding, database schema, Express + Firebase Auth verification, Google Sign-in.
- **Phase 1 — Onboarding**: Questions, profile persistence.
- **Phase 2 — Assessment**: Recording (`expo-audio`), Sarvam STT, deterministic metrics, LLM scoring, baseline report.
- **Phase 3 — Daily Practice**: 7-day track, session engine, follow-ups, feedback, weakness profile.
- **Phase 4 — Progress**: Score history, speaking time, session history.
- **Phase 5 — Peer Practice**: Expo Dev Client, availability, matching, LiveKit token generation, audio room, report/block.
- **Phase 6 — Closed Beta**: 20–30 users.

---

# 104–117. Locked Tech Stack & Final Product Rule
- Mobile: React Native, Expo SDK 57, TypeScript, Expo Router, NativeWind, TanStack Query, `expo-audio`, `expo-speech`, React Native Reanimated.
- Backend: Node.js, Express 5, TypeScript, Prisma, PostgreSQL, Zod.
- AI: Sarvam Saaras STT (`saaras:v4`), Sarvam 105B LLM, native TTS.
- Peer: LiveKit Cloud.
- Web Landing: Next.js, TypeScript, Tailwind CSS, GSAP.
