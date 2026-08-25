# Peer Practice & LiveKit Rules
<!-- description: Apply when working on peer scheduling, matching, LiveKit token generation, audio rooms, and peer safety/moderation. -->

## Architecture
- Scheduled 1-to-1 audio sessions (15 minutes).
- Backend (Express) handles: availability scheduling, matching algorithm, LiveKit room creation, access token generation, report/block persistence.
- LiveKit Cloud handles: WebRTC transport, audio media, and connection management. (Never proxy audio through Express).

## Hard Matching Invariants
- Never match a user with themselves (`userAId != userBId`).
- Never match users who have blocked or reported each other.
- Never create conflicting matches for the same user in the same time slot.
- Concurrency protection: Match creation must be idempotent and transactional.

## Safety & Moderation
- All users must be 18+.
- In-call controls must always be accessible: **Mute**, **Leave**, **Report**, **Block**.
- No DMs, no phone numbers, no social links, no public profiles.
