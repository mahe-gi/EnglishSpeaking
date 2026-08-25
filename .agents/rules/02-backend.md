# Backend Rules
<!-- glob: backend/**/*.ts, backend/**/*.json, backend/prisma/** -->

## Architecture
- Node.js, Express 5, TypeScript, PostgreSQL, Prisma, Zod.
- Modular monolith.
- Standard request path: `Route → Controller → Service → Prisma / External Provider`.
- Controllers are thin; services contain business logic.
- Do not introduce unnecessary architectural layers (no CQRS, no domain event buses, no repository factories).

## Backend Error Handling
- Handle: invalid input, unauthenticated requests, unauthorized access, missing resources, duplicate requests, external provider failure, database failure, timeouts, unexpected server errors.
- Never return stack traces, provider internals, raw SQL, or secrets to client applications.

## Client Neutrality
- Backend endpoints must be client-neutral (`/api/v1/*`).
- Do not return mobile-specific UI presentation metadata (font sizes, colors, layout hints).
- The future Next.js application will consume the exact same APIs.
