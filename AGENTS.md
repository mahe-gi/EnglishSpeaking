# AGENTS.md — Antigravity Agent Guidelines

Welcome, coding agent. This repository is built using an AI-assisted development workflow optimized for predictability, safety, testability, and seamless continuity between agents.

---

## 1. Source-of-Truth Hierarchy
When sources disagree, follow this strict precedence:
1. **Explicit latest user instruction**
2. **`@docs/PRD.md`** (The Product Source of Truth)
3. **`@docs/CURRENT_STATE.md`** (Living project state & exact next task)
4. **Existing accepted application behavior**
5. **Existing implementation**
6. **Agent assumptions**

> **Important**: The PRD is the product source of truth. Do not add features, change architecture, or invent abstractions unless the user explicitly requests it.

---

## 2. Repository Customizations & Mechanism Taxonomy
This repository utilizes three distinct agent customization layers:

| Layer | Location | Purpose & Activation |
|---|---|---|
| **Agent Rules** | `.agents/rules/*.md` | Persistent and glob-scoped engineering constraints (always-on or file-triggered). |
| **Agent Skills** | `.agents/skills/<name>/SKILL.md` | Reusable, repository-owned development runbooks automatically discovered and loaded via frontmatter descriptions. |
| **IDE Workflows** | Configured via IDE UI | Optional Antigravity IDE workflow automations triggered manually via `/workflow-name`. |

---

## 3. Mandatory Protocol Before Modifying Code
Before writing any code:
1. Read `@docs/PRD.md`.
2. Read `@docs/CURRENT_STATE.md`.
3. Read relevant rules in `.agents/rules/`.
4. Inspect `git status` and existing files.
5. Search the codebase first. Extend existing components/schemas/services before creating new files.
6. Identify the smallest implementation slice that satisfies the immediate requirement.

---

## 4. Architectural Rules
- **Backend:** Node.js + Express 5 + TypeScript + PostgreSQL (Neon) + Prisma. Modular monolith. Thin controllers, business logic in services. Direct Prisma access (no repository abstraction).
- **Mobile:** React Native + Expo SDK 57 + Expo Router + NativeWind + TanStack Query + `expo-audio` + `expo-speech`. (No Redux; TanStack Query owns server state).
- **Web:** Next.js + TypeScript + Tailwind CSS (client-independent shell).
- **AI Integration:** Sarvam Saaras STT (`saaras:v4`, `verbatim` mode) + Sarvam 105B LLM. Prompts treat transcript as untrusted user input. Output validated with Zod.
- **Audio Transport:** LiveKit Cloud for peer audio in Phase 5 (requires Expo Development Build). Raw practice audio is deleted immediately after transcription (0-day retention).

---

## 5. Non-Goals (MVP)
Do not implement unless explicitly requested:
- Social feeds, followers, DMs, public profiles
- Video calls, group calls
- AI avatars, 3D characters
- Microservices, Redis, Kafka, event buses, message queues
- Grammar courses, flashcards, certificates, badges, coins, leaderboards

---

## 6. Definition of Done
A task is complete only when:
- The minimal vertical requirement is implemented.
- TypeScript passes without errors (`npx tsc --noEmit`).
- Linters and automated tests pass.
- Relevant edge cases from `@docs/EDGE_CASES.md` are handled.
- No secrets or debug code remain.
- `@docs/CURRENT_STATE.md` is updated with the exact next task.
