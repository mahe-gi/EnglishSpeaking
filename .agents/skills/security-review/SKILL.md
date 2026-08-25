---
name: security-review
description: Audit Ntalo changes for authentication, authorization, uploads, secrets, privacy, rate limits and common vulnerabilities
---

# Security Review

This skill audits code changes for security, privacy, and data-integrity risks.

## Audit Checklist
1. **Secrets & Keys**:
   - Verify no API keys, private keys, or credentials exist in client bundles or git.
   - All external provider keys (`SARVAM_API_KEY`, `LIVEKIT_API_SECRET`, Firebase credentials) are strictly server-side.
2. **Authentication**:
   - Protected endpoints verify Firebase ID token using `firebase-admin`.
   - Never trust client-supplied `userId` or `firebaseUid` from request body.
3. **Authorization & IDOR**:
   - User can only access, modify, or delete resources they own.
4. **Input Validation & Sanitization**:
   - All route parameters, queries, and request bodies validated with strict Zod schemas.
   - File uploads enforced for MIME type and max size limits.
5. **Prompt Injection & AI Security**:
   - User speech transcript treated as untrusted data in prompt templates.
   - Strict separation between system instructions and evaluated transcript data.
6. **Logging & Privacy**:
   - No auth tokens, passwords, or full audio transcripts logged.
   - Raw audio deleted immediately after transcription.
7. **Severity Classification**:
   - `P0 / CRITICAL`: Security breach, auth bypass, secret exposure, IDOR → Must fix immediately.
   - `P1 / HIGH`: Flow blocker, data corruption → Must fix before release.
   - `P2 / MEDIUM` & `P3 / LOW`: Minor hardening → Address as appropriate.
