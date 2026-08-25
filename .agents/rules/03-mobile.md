# Mobile Rules
<!-- glob: mobile/**/*.ts, mobile/**/*.tsx -->

## Stack
- React Native, Expo SDK 57, TypeScript, Expo Router, NativeWind, TanStack Query, React Native Reanimated.
- Audio: `expo-audio` for recording, `expo-speech` for native TTS. (Do NOT use deprecated `expo-av`).
- State: TanStack Query owns server state. Do not add Redux or duplicate server state in global stores.

## Screen States & Mobile Lifecycle
- Every screen must explicitly consider 6 states: `loading`, `empty`, `success`, `error`, `offline`, `retry`.
- Handle: small/large screens, system text scaling, keyboard avoidance, safe-area insets, app backgrounding/restoration, rapid double-taps on CTAs, screen unmounting mid-request.

## Peer Audio Note
- LiveKit WebRTC audio requires native code. Peer practice in Phase 5 requires migrating from Expo Go to an Expo Development Build (`expo-dev-client`).
