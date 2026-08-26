---
name: ntalo-mobile-design
description: Design system and mobile UI/UX engineering guidelines for Ntalo spoken English practice app
---

# Ntalo Mobile Design System & UI/UX Guidelines

## Product & Brand Identity
- **Personality**: Calm, focused, conversational intelligence, premium, lightweight, distraction-free.
- **Core Promise**: Practice speaking English through real conversations.
- **Primary Surfaces**: Home, Talk with AI, Talk with a Person, Progress, Profile.

## Design Principles
1. **Light-First & Calibrated Contrast**: Clean, warm neutral surfaces (`#FAFAFA`, `#FFFFFF`, `#111827`, `#6B7280`).
2. **Typography-Led Hierarchy**: Clear weights (`regular: 400`, `medium: 500`, `semibold: 600`) without excessive sizing.
3. **No Decorative Emojis**: 0 emojis in user interface. Use clean vector icons (`Ionicons` from `@expo/vector-icons`).
4. **Restrained Layout**: Avoid nested card boxes and heavy drop shadows. Rely on whitespace, alignment, and subtle borders (`#E5E7EB`).
5. **Realtime Voice Focus**: Voice call interfaces communicate true system state (`Connecting`, `Listening`, `Thinking`, `Speaking`, `Muted`, `Error`) with subtle, UI-thread animations.
6. **Accessible Hit Targets**: Minimum 44x44px touch targets for buttons and interactive elements with clear accessibility labels.
