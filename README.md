# Ntalo

> Mobile-first spoken-English practice product for job interviews and workplace communication.

---

## Overview

Ntalo is designed to help learners transition from understanding English to speaking fluently and confidently in real job interviews and workplace conversations.

### Core Learning Loop
```text
ASSESS → PRACTICE WITH AI → GET FEEDBACK → PRACTICE AGAIN → PEER PRACTICE → TRACK PROGRESS
```

---

## Repository Structure

```text
/
├── mobile/             # React Native + Expo SDK 57 (Expo Router, NativeWind, TanStack Query)
├── backend/            # Node.js + Express 5 + TypeScript + PostgreSQL + Prisma
├── web/                # Next.js + TypeScript + Tailwind CSS (Landing shell)
├── docs/
│   ├── PRD.md          # Complete Product Requirements Document (Source of Truth)
│   ├── CURRENT_STATE.md# Living state tracker & exact next task for agents
│   └── EDGE_CASES.md   # System-wide edge cases & failure recovery registry
├── .agents/
│   ├── rules/          # 11 scoped and always-on engineering rules
│   └── skills/         # 6 Antigravity agent runbooks/skills
├── AGENTS.md           # AI Agent guidelines and protocol
├── .nvmrc              # Node version pin (22.23.1)
└── README.md
```

---

## Technology Stack

- **Mobile:** React Native (0.86), Expo SDK 57, Expo Router, TypeScript, StyleSheet primitives (NativeWind planned for product UI), TanStack Query, `expo-audio`, `expo-speech`, React Native Reanimated.
- **Backend:** Node.js (v22.23.1 LTS), Express 5, TypeScript, PostgreSQL (Neon), Prisma ORM, Zod.
- **Authentication:** Firebase Authentication (Google OAuth + linked email/password), verified server-side with Firebase Admin SDK.
- **AI Services:** Sarvam Saaras STT (`saaras:v4`, `verbatim` mode), Sarvam 105B LLM, native device TTS (`expo-speech`).
- **Peer Audio:** LiveKit Cloud (Phase 5; requires Expo Development Build).
- **Web Landing:** Next.js, TypeScript, Tailwind CSS, GSAP.

---

## Getting Started

### Prerequisites
- Node.js `22.23.1` (use `nvm use`)
- npm or pnpm

### Backend Development
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Mobile Development
```bash
cd mobile
npm install
cp .env.example .env
npm start
```

### Web Landing Development
```bash
cd web
npm install
npm run dev
```

---

## AI-Assisted Development
All AI coding agents must read `AGENTS.md`, `docs/PRD.md`, and `docs/CURRENT_STATE.md` before executing any task.
