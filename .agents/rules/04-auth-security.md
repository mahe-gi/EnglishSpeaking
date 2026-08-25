# Authentication & Security Rules
<!-- description: Apply whenever working on authentication, authorization, account linking, passwords, Firebase tokens, user deletion, protected APIs, or security-sensitive behavior. -->

## Authentication Architecture
- Provider: **Firebase Authentication**.
- Signup: **Continue with Google** only (no email/password signup form).
- Optional later: Link email/password credential to the existing Google account using Firebase `linkWithCredential()`.
- Backend token verification: Client sends Firebase ID Token via `Authorization: Bearer <token>`; Express verifies via `firebase-admin` and extracts Firebase UID.
- Invariant: Google login and password login must resolve to the exact same Firebase UID and PostgreSQL user ID.
- Never store passwords in PostgreSQL.
- Never trust client-supplied `userId`, `firebaseUid`, or `email` in request bodies.

## Authorization
- Authentication is not authorization (`authenticated != allowed`).
- Verify resource ownership on every mutation and private data lookup.

## API Security
- Validate all incoming request bodies and query params using Zod.
- Enforce file size and MIME type limits on audio multipart uploads.
- Never log auth tokens, passwords, or provider API keys.
